/** Native I.AM Scene editing inside SamSketch. Assets are account-owned R2 objects,
 * never bundled source models and never Spline runtime downloads. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createThreeViewport } from '@inneranimalmedia/agentsam-3d-viewer';
import { SceneEditor } from '../../../packages/iamscene/src/editor';
import type { SceneDocument, SceneNode, SceneTransform } from '../../../packages/iamscene/src/types';
import { sceneAssetUrl, updateScene, uploadSceneAsset } from './scene-api';
import { MODEL_IMPORT_ACCEPT, prepareModelImports, appendModelImports, type ModelImport } from './scene-file-import';
import './native-scene-editor.css';

export interface NativeSceneEditorHandle { dispose(): void; }
export interface NativeSceneEditorOptions {
  host: HTMLElement;
  sceneId: string;
  contentHash: string;
  document: SceneDocument;
  onBack(): void;
  onSaved(contentHash: string): void;
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] || char));
const fmt = (value: number) => Number(value.toFixed(4)).toString();
const threeVec = (vector: THREE.Vector3): [number,number,number] => vector.toArray() as [number,number,number];
const quaternion = (value: THREE.Quaternion): [number,number,number,number] => value.toArray() as [number,number,number,number];

export function mountNativeSceneEditor(options: NativeSceneEditorOptions): NativeSceneEditorHandle {
  const editor = new SceneEditor(options.document);
  let currentHash = options.contentHash;
  let savedRevision = editor.revision;
  let loading = true;
  let disposed = false;
  let selectedId: string | null = null;
  let saving: Promise<void> | null = null;
  const model = new THREE.Group();
  const loadedAssets = new Map<string,THREE.Object3D>();
  const nodeObjects = new Map<string,THREE.Object3D>();
  let importing: Promise<void> | null = null;
  let dragDepth = 0;
  const host = document.createElement('section');
  host.className = 'ss-native-editor';
  host.setAttribute('aria-label','Native I.AM Scene editor');
  host.innerHTML = `
    <header class="ss-native-top">
      <button type="button" data-action="back" class="ss-native-action">← Scenes</button>
      <div class="ss-native-title"><strong>${escape(options.document.metadata.name)}</strong><span>Native I.AM Scene · account-owned</span></div>
      <div class="ss-native-buttons">
        <span id="ss-native-status" role="status">Loading source asset…</span>
        <button type="button" data-action="import" class="ss-native-primary" title="Add models to this scene">+ Import models</button>
        <input type="file" id="ss-native-file-input" accept="${MODEL_IMPORT_ACCEPT}" multiple hidden aria-label="Choose 3D models and their companion files">
        <button type="button" data-action="undo" class="ss-native-action" title="Undo">Undo</button>
        <button type="button" data-action="redo" class="ss-native-action" title="Redo">Redo</button>
        <button type="button" data-action="save" class="ss-native-primary">Save scene</button>
      </div>
    </header>
    <div class="ss-native-body">
      <aside class="ss-native-layers"><div class="ss-native-pane-header">Scene objects <small id="ss-native-count"></small></div><div class="ss-native-rail-import"><button type="button" data-action="import" class="ss-native-action">+ Add model to scene</button><small>GLB · glTF · OBJ · STL · PLY · FBX · DAE</small></div><div id="ss-native-tree" class="ss-native-tree"></div></aside>
      <main class="ss-native-stage"><div class="ss-native-tools" role="toolbar" aria-label="Scene transform tools">
        <button type="button" data-action="move" class="is-active">Move</button>
        <button type="button" data-action="rotate">Rotate</button>
        <button type="button" data-action="scale">Scale</button>
        <button type="button" data-action="frame">Frame scene</button>
      </div><div id="ss-native-viewport" class="ss-native-viewport"></div><div class="ss-native-empty" id="ss-native-empty" hidden><strong>Bring your models into the scene</strong><span>Drop 3D models here or choose files. Models are saved to your account, with editable parts and their original source files.</span><button type="button" data-action="import" class="ss-native-primary">Choose models</button><small>GLB · glTF · OBJ · STL · PLY · FBX · DAE</small></div><div class="ss-native-drop-overlay" id="ss-native-drop" hidden><strong>Drop models to add them</strong><span>Multiple files supported · same scene · editable hierarchy</span></div><div class="ss-native-hint">Drag to orbit · Select a part to edit · Transform with the gizmo</div></main>
      <aside class="ss-native-inspector"><div class="ss-native-pane-header">Properties</div><div id="ss-native-props"></div></aside>
    </div>`;
  options.host.append(host);
  const root = host.querySelector<HTMLElement>('#ss-native-viewport')!;
  const tree = host.querySelector<HTMLElement>('#ss-native-tree')!;
  const props = host.querySelector<HTMLElement>('#ss-native-props')!;
  const status = host.querySelector<HTMLElement>('#ss-native-status')!;
  const fileInput = host.querySelector<HTMLInputElement>('#ss-native-file-input')!;
  const emptyState = host.querySelector<HTMLElement>('#ss-native-empty')!;
  const dropOverlay = host.querySelector<HTMLElement>('#ss-native-drop')!;
  const stage = host.querySelector<HTMLElement>('.ss-native-stage')!;
  const viewport = createThreeViewport(root,{THREE,OrbitControls},{
    wrapper:false,background:editor.document.environment.background,controls:true,
    autoRender:true,preserveDrawingBuffer:true,antialias:true,lights:false,shadowMap:{enabled:true},
    maxPixelRatio:2,fov:editor.document.camera.fov,near:0.01,far:100000,
  });
  viewport.scene.background = new THREE.Color(editor.document.environment.background);
  viewport.scene.add(model);
  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  gltfLoader.setDRACOLoader(dracoLoader);
  const ambient = new THREE.AmbientLight('#ffffff',Math.max(0.5,editor.document.environment.ambientIntensity));
  viewport.scene.add(ambient);
  const keyLight = new THREE.DirectionalLight('#ffffff',2.1);keyLight.position.set(7,15,10);viewport.scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight('#c2d5ff',1.1);fillLight.position.set(-9,7,-6);viewport.scene.add(fillLight);
  const transform = new TransformControls(viewport.camera as THREE.PerspectiveCamera,viewport.renderer.domElement);
  viewport.scene.add(transform.getHelper());
  transform.addEventListener('dragging-changed',event=>{const active=Boolean(event.value);if(viewport.controls)viewport.controls.enabled=!active;if(!active)commitSelectedTransform();});
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const resizeObserver = new ResizeObserver(()=>viewport.resize());
  resizeObserver.observe(root);
  function notify(message:string){status.textContent=message;}
  function updateEmptyState(){emptyState.hidden=editor.document.assets.some(asset=>asset.mediaType==='model/gltf-binary'&&asset.role==='presentation');}
  function lookup(id:string|null){return editor.document.scene.nodes.find(node=>node.id===id)||null;}
  function updateNode(id:string,patch:Partial<Omit<SceneNode,'id'>>){
    editor.updateNode(id,patch);
    const object=nodeObjects.get(id);
    if(object){
      if(patch.visible!==undefined)object.visible=patch.visible;
      if(patch.transform){
        if(patch.transform.position)object.position.fromArray(patch.transform.position);
        if(patch.transform.rotation)object.quaternion.fromArray(patch.transform.rotation);
        if(patch.transform.scale)object.scale.fromArray(patch.transform.scale);
      }
    }
    notify('Unsaved changes');renderTree();
    // Keep the inspector input nodes mounted during change/blur; selection refreshes their values.
    viewport.render();
  }
  function commitSelectedTransform(){
    if(disposed||!selectedId)return;
    const target=nodeObjects.get(selectedId),node=lookup(selectedId);
    if(!target||!node)return;
    const value:SceneTransform={position:threeVec(target.position),rotation:quaternion(target.quaternion),scale:threeVec(target.scale)};
    if(JSON.stringify(value)!==JSON.stringify(node.transform))updateNode(selectedId,{transform:value});
  }
  function renderTree(){
    const document=editor.document;
    const nodes=new Map(document.scene.nodes.map(node=>[node.id,node]));
    const children=new Map<string,SceneNode[]>();
    for(const node of document.scene.nodes){const parent=node.parentId||'root';const group=children.get(parent)||[];group.push(node);children.set(parent,group);}
    const visited=new Set<string>();
    function rows(parent:string,depth:number):string{
      return (children.get(parent)||[]).filter(node=>!visited.has(node.id)).map(node=>{
        visited.add(node.id);
        return `<div class="ss-native-row${node.id===selectedId?' is-selected':''}" data-node="${escape(node.id)}" style="--depth:${Math.min(depth,12)}">
          <span class="ss-native-node-type" aria-hidden="true">${node.kind==='light'?'☀':node.kind==='group'?'▦':node.kind==='text'?'T':'◇'}</span>
          <span class="ss-native-node-name" title="${escape(node.name)}">${escape(node.name)}</span>
          <button type="button" data-eye="${escape(node.id)}" aria-label="Toggle visibility for ${escape(node.name)}">${node.visible?'◉':'○'}</button>
        </div>${rows(node.id,depth+1)}`;
      }).join('');
    }
    tree.innerHTML=rows('root',0);
    host.querySelector<HTMLElement>('#ss-native-count')!.textContent=`${document.scene.nodes.length} nodes`;
    updateEmptyState();
  }
  function renderProperties(){
    const node=lookup(selectedId);
    if(!node){props.innerHTML='<p class="ss-native-empty">Choose a scene object to edit its transform and visibility.</p>';return;}
    const pos=node.transform.position||[0,0,0],scale=node.transform.scale||[1,1,1];
    const object=nodeObjects.get(node.id);
    const deg=object?[object.rotation.x,object.rotation.y,object.rotation.z].map(v=>Math.round(THREE.MathUtils.radToDeg(v)*100)/100):[0,0,0];
    const inputs=(field:'position'|'rotation'|'scale',values:number[])=>`<fieldset class="ss-native-vector"><legend>${field}</legend><div>${values.map((v,i)=>`<label>${'XYZ'[i]}<input type="number" step="0.01" data-field="${field}" data-axis="${i}" value="${fmt(v)}"></label>`).join('')}</div></fieldset>`;
    props.innerHTML=`<div class="ss-native-properties"><label class="ss-native-property-name">${escape(node.kind)}<strong>${escape(node.name)}</strong></label>
      <label class="ss-native-visible"><input type="checkbox" data-field="visible" ${node.visible?'checked':''}> Visible</label>
      ${inputs('position',pos)}${inputs('rotation',deg)}${inputs('scale',scale)}
      <small>Object ID: ${escape(node.id)}</small><button type="button" data-action="focus" class="ss-native-action">Focus selected</button></div>`;
  }
  function selectNode(id:string|null){
    if(id&&!lookup(id))return;
    selectedId=id;
    const object=id?nodeObjects.get(id):undefined;
    if(object)transform.attach(object);else transform.detach();
    renderTree();renderProperties();viewport.render();
  }
  function frame(selected=false){const item=selected&&selectedId?nodeObjects.get(selectedId):model;if(item&&((item!==model)||model.children.length))viewport.fit(item,1.5);viewport.render();}
  function applyDocument(next:SceneDocument){
    const definitions=new Map(next.scene.nodes.map(node=>[node.id,node]));
    if(selectedId&&!definitions.has(selectedId)){selectedId=null;transform.detach();}
    for(const [id,object] of nodeObjects){
      const node=definitions.get(id);
      if(!node){object.visible=false;continue;}
      object.visible=node.visible;
      if(node.transform.position)object.position.fromArray(node.transform.position);
      if(node.transform.rotation)object.quaternion.fromArray(node.transform.rotation);
      if(node.transform.scale)object.scale.fromArray(node.transform.scale);
    }
    void reconcileAssets(next).catch(error=>notify(error instanceof Error?error.message:String(error)));
    renderTree();renderProperties();viewport.render();
  }
  function undo(redo=false){if(loading)return;const result=redo?editor.redo():editor.undo();applyDocument(result.document);notify('Unsaved changes');}
  function capturePreview():string|undefined{
    try{viewport.render();const canvas=viewport.renderer.domElement,thumb=document.createElement('canvas');thumb.width=400;thumb.height=240;
      const context=thumb.getContext('2d');if(!context)return undefined;
      const scale=Math.min(400/canvas.width,240/canvas.height);context.fillStyle=editor.document.environment.background;context.fillRect(0,0,400,240);
      context.drawImage(canvas,(400-canvas.width*scale)/2,(240-canvas.height*scale)/2,canvas.width*scale,canvas.height*scale);
      const value=thumb.toDataURL('image/webp',0.75);return value.length<330000?value:undefined;
    }catch{return undefined;}
  }
  async function save(){
    if(saving)return saving;
    saving=(async()=>{
      notify('Saving…');const snapshot=editor.document;
      const result=await updateScene(options.sceneId,currentHash,snapshot,capturePreview());
      currentHash=result.scene.contentHash;savedRevision=editor.revision;
      notify('Saved to account');options.onSaved(currentHash);
    })();
    try{await saving;}catch(error){notify('Save failed');throw error;}finally{saving=null;}
  }
  async function back(){
    if(editor.revision!==savedRevision){try{await save();}catch(error){notify('Save failed — scene kept open');return;}}
    options.onBack();
  }
  async function loadModelAsset(asset: SceneDocument['assets'][number], document: SceneDocument){
    const url=sceneAssetUrl(options.sceneId,asset.id);
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error('Cannot retrieve '+asset.id+' (HTTP '+response.status+')');
    const binary=await response.arrayBuffer();
    const gltf=await gltfLoader.parseAsync(binary,url.slice(0,url.lastIndexOf('/')+1));
    if(disposed)return;
    const root=gltf.scene;
    const associations=(gltf.parser as unknown as {associations?:Map<THREE.Object3D,{nodes?:number}>}).associations;
    const byIndex=new Map<number,THREE.Object3D>();
    root.traverse(object=>{
      const nodeIndex=associations?.get(object)?.nodes;
      if(typeof nodeIndex==='number')byIndex.set(nodeIndex,object);
      if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;}
      const authored=object.userData?.iamSceneNodeId;
      if(typeof authored==='string'&&document.scene.nodes.some(node=>node.id===authored))nodeObjects.set(authored,object);
    });
    for(const node of document.scene.nodes){
      const binding=node.userData?.iamGltf as {assetId?:string;nodeIndex?:number}|undefined;
      if(binding?.assetId!==asset.id)continue;
      const object=typeof binding.nodeIndex==='number'?byIndex.get(binding.nodeIndex):root;
      if(!object)continue;
      nodeObjects.set(node.id,object);
      object.userData.iamSceneNodeId=node.id;
      if(node.transform.position)object.position.fromArray(node.transform.position);
      if(node.transform.rotation)object.quaternion.fromArray(node.transform.rotation);
      if(node.transform.scale)object.scale.fromArray(node.transform.scale);
      object.visible=node.visible;
    }
    model.add(root);loadedAssets.set(asset.id,root);
  }
  async function reconcileAssets(document: SceneDocument){
    const presentation=document.assets.filter(asset=>asset.mediaType==='model/gltf-binary'&&asset.role==='presentation');
    const wanted=new Set(presentation.map(asset=>asset.id));
    for(const [id,object] of loadedAssets)object.visible=wanted.has(id);
    for(const asset of presentation){
      if(!loadedAssets.has(asset.id))await loadModelAsset(asset,document);
    }
    for(const node of document.scene.nodes){
      const object=nodeObjects.get(node.id);
      if(!object)continue;
      const binding=node.userData?.iamGltf as {assetId?:string}|undefined;
      if(binding?.assetId&&!wanted.has(binding.assetId))continue;
      if(node.transform.position)object.position.fromArray(node.transform.position);
      if(node.transform.rotation)object.quaternion.fromArray(node.transform.rotation);
      if(node.transform.scale)object.scale.fromArray(node.transform.scale);
      object.visible=node.visible;
    }
    updateEmptyState();viewport.render();
  }
  async function importModels(files: File[]){
    if(disposed||loading)return;
    if(saving)await saving;
    const imported=await prepareModelImports(files,notify);
    const before=editor.document;
    const merged=appendModelImports(before,imported);
    const updated=await updateScene(options.sceneId,currentHash,merged);
    currentHash=updated.scene.contentHash;
    try{
      for(const item of imported)for(const upload of item.uploads){
        notify('Saving '+item.title+' · '+upload.asset.mediaType);
        const blob=new Blob([upload.bytes.slice().buffer as ArrayBuffer],{type:upload.asset.mediaType});
        await uploadSceneAsset(options.sceneId,upload.asset.id,blob,upload.asset.mediaType);
      }
    }catch(error){
      try{
        const rollback=await updateScene(options.sceneId,currentHash,before);
        currentHash=rollback.scene.contentHash;
      }catch(rollbackError){
        notify('Import failed and scene rollback failed. Reopen this scene before editing.');
        throw new Error('Import storage rollback failed: '+String(rollbackError));
      }
      throw error;
    }
    editor.transact(draft=>{
      draft.assets=merged.assets;
      draft.materials=merged.materials;
      draft.scene=merged.scene;
      draft.metadata=merged.metadata;
    });
    notify('Loading '+imported.length+' model'+(imported.length===1?'':'s')+'…');
    await reconcileAssets(editor.document);
    selectedId=imported[imported.length-1]?.rootId||null;
    selectNode(selectedId);
    frame(true);
    await save(); // Captures a real preview and refreshes account/gallery state.
    notify('Saved '+imported.length+' model'+(imported.length===1?'':'s')+' to your scene.');
  }
  function queueModelImport(files:File[]){
    if(importing){notify('A model import is already running.');return;}
    importing=importModels(files).catch(error=>notify('Import failed: '+(error instanceof Error?error.message:String(error)))).finally(()=>{importing=null;});
  }
  async function load(){
    try{
      await reconcileAssets(editor.document);
      loading=false;
      notify(model.children.length?'Ready · native scene':'Ready · add or drop 3D models');
      if(model.children.length)frame();
      renderTree();renderProperties();
    }catch(error){
      loading=false;notify('Scene load failed: '+(error instanceof Error?error.message:String(error)));
      renderTree();renderProperties();
    }
  }
  function clickHandler(event:MouseEvent){
    const element=event.target as HTMLElement;
    const eye=element.closest<HTMLElement>('[data-eye]');
    if(eye){const id=eye.dataset.eye!,node=lookup(id);if(node)updateNode(id,{visible:!node.visible});return;}
    const row=element.closest<HTMLElement>('[data-node]');if(row){selectNode(row.dataset.node!);return;}
    const action=element.closest<HTMLElement>('[data-action]')?.dataset.action;
    if(!action)return;
    if(action==='import'){fileInput.click();return;}
    if(importing){notify('Finish importing models before changing the scene.');return;}
    if(action==='back')void back();
    else if(action==='save')void save().catch(()=>{});
    else if(action==='undo')undo();else if(action==='redo')undo(true);
    else if(action==='frame')frame();else if(action==='focus')frame(true);
    else if(['move','rotate','scale'].includes(action)){
      transform.setMode(action==='move'?'translate':action==='rotate'?'rotate':'scale');
      host.querySelectorAll<HTMLElement>('.ss-native-tools [data-action]').forEach(button=>button.classList.toggle('is-active',button.dataset.action===action));
    }
  }
  function changeHandler(event:Event){
    const field=(event.target as HTMLInputElement).dataset.field;
    if(!field||!selectedId)return;
    const node=lookup(selectedId);if(!node)return;
    if(field==='visible'){updateNode(node.id,{visible:(event.target as HTMLInputElement).checked});return;}
    const axis=Number((event.target as HTMLInputElement).dataset.axis),value=Number((event.target as HTMLInputElement).value);
    if(!Number.isFinite(value)||axis<0||axis>2)return;
    const object=nodeObjects.get(node.id);
    if(!object)return;
    if(field==='position')object.position.setComponent(axis,value);
    else if(field==='scale')object.scale.setComponent(axis,value);
    else if(field==='rotation'){const euler=object.rotation.clone();if(axis===0)euler.x=THREE.MathUtils.degToRad(value);else if(axis===1)euler.y=THREE.MathUtils.degToRad(value);else euler.z=THREE.MathUtils.degToRad(value);object.rotation.copy(euler);}
    updateNode(node.id,{transform:{position:threeVec(object.position),rotation:quaternion(object.quaternion),scale:threeVec(object.scale)}});
  }
  function selectFromCanvas(event:PointerEvent){
    if(!model||transform.dragging)return;
    const rect=viewport.renderer.domElement.getBoundingClientRect();
    if(rect.width===0||rect.height===0)return;
    pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    raycaster.setFromCamera(pointer,viewport.camera as THREE.Camera);
    const intersection=raycaster.intersectObject(model,true)[0];
    if(!intersection)return;
    let object:THREE.Object3D|null=intersection.object;
    while(object&&(!object.userData?.iamSceneNodeId||!lookup(object.userData.iamSceneNodeId)))object=object.parent;
    if(object)selectNode(object.userData.iamSceneNodeId);
  }
  fileInput.addEventListener('change',()=>{
    const files=Array.from(fileInput.files||[]);
    fileInput.value='';
    if(files.length)queueModelImport(files);
  });
  const isFileDrag=(event:DragEvent)=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  stage.addEventListener('dragenter',event=>{
    if(!isFileDrag(event))return;
    event.preventDefault();dragDepth++;dropOverlay.hidden=false;
  });
  stage.addEventListener('dragover',event=>{
    if(!isFileDrag(event))return;
    event.preventDefault();
    if(event.dataTransfer)event.dataTransfer.dropEffect='copy';
  });
  stage.addEventListener('dragleave',event=>{
    if(!isFileDrag(event))return;
    dragDepth=Math.max(0,dragDepth-1);
    if(!dragDepth)dropOverlay.hidden=true;
  });
  stage.addEventListener('drop',event=>{
    if(!isFileDrag(event))return;
    event.preventDefault();event.stopPropagation();dragDepth=0;dropOverlay.hidden=true;
    const files=Array.from(event.dataTransfer?.files||[]);
    if(files.length)queueModelImport(files);
  });
  host.addEventListener('click',clickHandler);
  host.addEventListener('change',changeHandler);
  viewport.renderer.domElement.addEventListener('pointerup',selectFromCanvas);
  renderTree();renderProperties();void load();
  return {dispose(){if(disposed)return;disposed=true;resizeObserver.disconnect();host.removeEventListener('click',clickHandler);host.removeEventListener('change',changeHandler);viewport.renderer.domElement.removeEventListener('pointerup',selectFromCanvas);transform.detach();transform.dispose();dracoLoader.dispose();viewport.dispose();host.remove();}};
}
