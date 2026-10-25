import {useCallback,useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {TerrainEditorPanel} from './TerrainEditorPanel';
import {createTerrainDocument,addSculptStroke,type TerrainDocument,type SculptMode} from '../lib/world-terrain';
import {createTerrainProjection,type TerrainProjection} from '../lib/world-terrain-three';

type Zone={roomId:string;label:string;candidateCameraBlenderXYZMetres?:number[];anchorStatus?:string};
type Handoff={projectId:string;sceneRevision:string;scene:{nodeCount:number;architectureNodeCount:number;glbSha256:string};zones:Zone[]};
type Selected={designId:string;category:string;nodeName:string;source:string};
type CameraMode='orbit'|'walk';
type ViewPreset='iso'|'plan'|'front'|'side';
export type CadSceneInventoryGroup = {category:string; count:number};
const POSKEY='agentsam.dreamhouse.camera.v1.1';
const ORBIT_SPEED=0.007;

export interface CadWorldViewportProps {
 modelUrl:string;
 manifestUrl?:string;
 sceneLabel:string;
 revision:string;
 readOnly?:boolean;
 onSelect?:(s:Selected)=>void;
 onSceneInventory?:(groups:CadSceneInventoryGroup[])=>void;
}
export function CadWorldViewport({modelUrl,manifestUrl,sceneLabel,revision,readOnly=true,onSelect,onSceneInventory}:CadWorldViewportProps) {
 const mount=useRef<HTMLDivElement>(null),renderer=useRef<THREE.WebGLRenderer|null>(null),
 sceneRef=useRef<THREE.Scene|null>(null),cameraRef=useRef<THREE.PerspectiveCamera|null>(null);
 const assetRef=useRef<THREE.Object3D|null>(null),collidersRef=useRef<THREE.Object3D[]>([]);
 const target=useRef(new THREE.Vector3()),orbit=useRef({az:0.9,el:0.65,distance:65});
 const walk=useRef({yaw:0,pitch:0,position:new THREE.Vector3(),active:false});
 const pressed=useRef(new Set<string>()),pointer=useRef<{x:number;y:number;id:number;distance:number}|null>(null);
 const touchPointers=useRef(new Map<number,{x:number;y:number}>()),pinchDistance=useRef<number|null>(null);
 const terrainProjection=useRef<TerrainProjection|null>(null);
 const terrainOrigin=useRef(new THREE.Vector3());
 const terrainDocRef=useRef<TerrainDocument>(createTerrainDocument());
 const terrainBrushRef=useRef<{mode:SculptMode|null;radius:number;strength:number}>({mode:null,radius:12,strength:3});
 const lastBrushAt=useRef(0);
 const [mode,setMode]=useState<CameraMode>('orbit'),[ready,setReady]=useState(false),
 [error,setError]=useState(''),[progress,setProgress]=useState('Resolving project geometry…'),
 [handoff,setHandoff]=useState<Handoff|null>(null),[selection,setSelection]=useState<Selected|null>(null),
 [roofVisible,setRoofVisible]=useState(true),[hour,setHour]=useState<'day'|'evening'>('day');
 const [wireframe,setWireframe]=useState(false),[viewPreset,setViewPreset]=useState<ViewPreset>('iso');
 const [terrain,setTerrain]=useState<TerrainDocument>(()=>createTerrainDocument());
 const [terrainOpen,setTerrainOpen]=useState(false);
 const [sculptMode,setSculptMode]=useState<SculptMode|null>(null);
 const [brushRadius,setBrushRadius]=useState(12),[brushStrength,setBrushStrength]=useState(3);
 const bounds=useRef(new THREE.Box3());
 const modelBounds=useRef(new THREE.Box3());
 const environmentRef=useRef<{sky:Sky;sun:THREE.DirectionalLight;fill:THREE.HemisphereLight}|null>(null);
 const materialSets=useRef(new Map<THREE.Mesh,{lit:THREE.Material|THREE.Material[];color:THREE.Material|THREE.Material[]}>());
 const [shading,setShading]=useState<'lit'|'color'>('lit');
 const [exposure,setExposure]=useState(.72),[sunStrength,setSunStrength]=useState(1),[fillStrength,setFillStrength]=useState(.55);
 const [skyVisible,setSkyVisible]=useState(true);
 const displayRef=useRef({mode,roofVisible,hour});
 useEffect(()=>{displayRef.current={mode,roofVisible,hour}},[mode,roofVisible,hour]);
 useEffect(()=>{terrainDocRef.current=terrain},[terrain]);
 useEffect(()=>{terrainBrushRef.current={mode:sculptMode,radius:brushRadius,strength:brushStrength}},[sculptMode,brushRadius,brushStrength]);
 const visit=(zone:Zone)=>{
  if(!zone.candidateCameraBlenderXYZMetres||!ready)return;
  const [x,y,z]=zone.candidateCameraBlenderXYZMetres;
  // Blender Z-up -> glTF Y-up once, preserving canonical world units.
  walk.current.position.set(x,z,-y);
  walk.current.yaw=0;walk.current.pitch=0;
  walk.current.active=true;
  setMode('walk');
 };
 const reset=()=>{
  if(modelBounds.current.isEmpty())return;
  const center=modelBounds.current.getCenter(new THREE.Vector3()),size=modelBounds.current.getSize(new THREE.Vector3());
  target.current.copy(center);
  orbit.current={az:0.85,el:0.5,distance:Math.max(12,size.length()*0.56)};
  setViewPreset('iso');
  walk.current.position.set(center.x,Math.max(1.7,bounds.current.min.y+1.7),center.z);
  setMode('orbit');
 };
 const setView=(preset:ViewPreset)=>{
  if(modelBounds.current.isEmpty())return;
  const size=modelBounds.current.getSize(new THREE.Vector3());
  target.current.copy(modelBounds.current.getCenter(new THREE.Vector3()));
  const distance=Math.max(12,size.length()*(preset==='plan'?.8:.66));
  orbit.current=preset==='plan'
    ?{az:0,el:Math.PI/2-.025,distance}
    :preset==='front'?{az:0,el:.075,distance}
    :preset==='side'?{az:Math.PI/2,el:.075,distance}
    :{az:.88,el:.49,distance};
  setViewPreset(preset);setMode('orbit');
 };
 const exportSnapshot=()=>{
  const webgl=renderer.current,scene=sceneRef.current,camera=cameraRef.current;
  if(!webgl||!scene||!camera||!ready)return;
  webgl.render(scene,camera);
  const link=document.createElement('a');
  link.download=`${sceneLabel.replace(/[^a-z0-9_-]+/gi,'-')}-${revision}-${viewPreset}${wireframe?'-wireframe':''}-${hour}.png`;
  link.href=webgl.domElement.toDataURL('image/png');link.click();
 };
 const fitSite=()=>{
  target.current.copy(terrainOrigin.current);
  orbit.current={az:.88,el:.5,distance:Math.max(terrain.width,terrain.depth)*.82};
  setMode('orbit');
 };
 useEffect(()=>{
  const host=mount.current;if(!host)return;
  let alive=true;
  let gltfRoot:THREE.Object3D|null=null;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#0a1420');sceneRef.current=scene;
  const camera=new THREE.PerspectiveCamera(56,1,.06,2400);cameraRef.current=camera;
  const context=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false,preserveDrawingBuffer:true});
  context.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  context.outputColorSpace=THREE.SRGBColorSpace;context.toneMapping=THREE.ACESFilmicToneMapping;
  context.toneMappingExposure=0.64;
  context.shadowMap.enabled=true;
  context.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.current=context;host.appendChild(context.domElement);
  const sun=new THREE.DirectionalLight('#fff0d7',1.05);sun.position.set(80,125,55);sun.castShadow=true;
  const shadowSize=window.innerWidth<768?1024:2048;
  sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.camera.left=-105;sun.shadow.camera.right=105;
  sun.shadow.camera.top=105;sun.shadow.camera.bottom=-105;sun.shadow.camera.near=1;sun.shadow.camera.far=310;
  sun.shadow.bias=-0.0002;sun.shadow.normalBias=0.025;scene.add(sun);
  const fill=new THREE.HemisphereLight('#dceeff','#53644d',0.55);scene.add(fill);
  const sky=new Sky();sky.scale.setScalar(1000);
  sky.material.uniforms['turbidity'].value=3.5;
  sky.material.uniforms['rayleigh'].value=2.1;
  sky.material.uniforms['mieCoefficient'].value=0.005;
  sky.material.uniforms['mieDirectionalG'].value=0.78;
  sky.material.uniforms['sunPosition'].value.copy(sun.position);
  scene.add(sky);
  scene.fog=new THREE.Fog('#b5c5cb',260,1150);
  environmentRef.current={sky,sun,fill};
  const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);camera.aspect=w/h;camera.updateProjectionMatrix();context.setSize(w,h)};
  const observer=new ResizeObserver(resize);observer.observe(host);resize();
  const ray=new THREE.Raycaster();const floorRay=new THREE.Raycaster();
  let animation=0,last=performance.now();
  let loaded=false;
  const animate=(now:number)=>{
   if(!alive)return;
   const delta=Math.min((now-last)/1000,.075);last=now;
   const state=displayRef.current;
   if(state.mode==='orbit'){
    const o=orbit.current;
    camera.position.set(
      target.current.x+Math.sin(o.az)*Math.cos(o.el)*o.distance,
      target.current.y+Math.sin(o.el)*o.distance,
      target.current.z+Math.cos(o.az)*Math.cos(o.el)*o.distance
    );
    camera.lookAt(target.current);
   } else {
    const view=walk.current;
    if(!view.active){view.position.copy(camera.position);view.active=true}
    const move=new THREE.Vector3();
    if(pressed.current.has('KeyW')||pressed.current.has('ArrowUp'))move.z-=1;
    if(pressed.current.has('KeyS')||pressed.current.has('ArrowDown'))move.z+=1;
    if(pressed.current.has('KeyA')||pressed.current.has('ArrowLeft'))move.x-=1;
    if(pressed.current.has('KeyD')||pressed.current.has('ArrowRight'))move.x+=1;
    if(move.lengthSq()>0){
      move.normalize().applyAxisAngle(new THREE.Vector3(0,1,0),view.yaw);
      const speed=(pressed.current.has('ShiftLeft')?5.5:2.7)*delta;
      const step=move.multiplyScalar(speed);
      const blocked=collidersRef.current.some(hit=>{
        if(!('isMesh' in hit))return false;
        const distance=step.length();
        const direction=step.clone().normalize();
        ray.set(view.position.clone(),direction);
        ray.far=distance+0.33;
        return ray.intersectObject(hit,false).length>0;
      });
      if(!blocked){
        const next=view.position.clone().add(step);
        // Keep camera at standing eye height above real floor when a slab is below.
        floorRay.set(next.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0));
        floorRay.far=3.5;
        const ground=floorRay.intersectObjects([...collidersRef.current,...(terrainProjection.current?[terrainProjection.current.surface]:[])],false)
          .find(hit=>hit.face?.normal && hit.face.normal.y>.4);
        if(ground)next.y=ground.point.y+1.65;
        view.position.copy(next);
      }
    }
    camera.position.copy(view.position);
    camera.rotation.order='YXZ';
    camera.rotation.y=view.yaw;camera.rotation.x=view.pitch;camera.rotation.z=0;
   }
   context.render(scene,camera);
   animation=requestAnimationFrame(animate);
  };
  animation=requestAnimationFrame(animate);
  const fetchWorld=async()=>{
   try{
    if(manifestUrl){
     const manifestResponse=await fetch(manifestUrl,{credentials:'same-origin'});
     if(manifestResponse.ok){
      const manifest: Handoff=await manifestResponse.json();
      if(alive&&Array.isArray(manifest.zones))setHandoff(manifest);
     }
    }
    if(!alive)return;setProgress('Streaming registered model geometry…');
    new GLTFLoader().setWithCredentials(modelUrl.startsWith('/')).load(modelUrl, gltf=>{
      if(!alive)return;
      gltfRoot=gltf.scene;
      const box=new THREE.Box3().setFromObject(gltfRoot);
      if(box.isEmpty())throw Error('Model GLB contains no geometry');
      bounds.current.copy(box);
      // Frame the real architecture, not the full parcel's Ground mesh;
      // the previous fit made the house a tiny speck on a bright field.
      const architectureBox=new THREE.Box3();
      gltfRoot.traverse(node=>{
        const category=String(node.userData?.Category||'').toLowerCase();
        if(node instanceof THREE.Mesh&&['wall','window','door','roof','slab'].includes(category))
          architectureBox.expandByObject(node);
        if(/^Ground(?:$|[_.])/i.test(node.name)){
          // Original surveyed/staged site is preserved in the GLB. Replace only its
          // visual projection with an editable terrain surface at its measured top.
          const groundBox=new THREE.Box3().setFromObject(node);
          const groundCenter=groundBox.getCenter(new THREE.Vector3());
          terrainOrigin.current.set(groundCenter.x,groundBox.max.y-.02,groundCenter.z);
          node.visible=false;
        }
      });
      const focusBox=architectureBox.isEmpty()?box:architectureBox;
      modelBounds.current.copy(focusBox);
      const center=focusBox.getCenter(new THREE.Vector3()),size=focusBox.getSize(new THREE.Vector3());
      const environment=environmentRef.current;
      if(environment){
        environment.sun.target.position.copy(center);
        scene.add(environment.sun.target);
      }
      target.current.copy(center);
      const ratio=host.clientWidth/Math.max(1,host.clientHeight);
      orbit.current={az:.88,el:.49,distance:Math.max(11,size.length()*(ratio<.7?1.7:ratio<1.25?1.15:.85))};
      walk.current.position.set(center.x,Math.max(1.65,box.min.y+1.65),center.z);
      const structure:THREE.Object3D[]=[];
      const authoredMaterialPalette=new Map<THREE.Material,THREE.MeshBasicMaterial>();
      const materialColor=(source:THREE.Material):THREE.MeshBasicMaterial=>{
        const cached=authoredMaterialPalette.get(source);
        if(cached)return cached;
        const gltf=source as THREE.MeshStandardMaterial;
        const material=new THREE.MeshBasicMaterial({
          name:'CAD Color Fidelity · '+source.name,
          color:gltf.color?.clone()||new THREE.Color('#a6a9a7'),
          map:gltf.map||null,transparent:gltf.transparent,opacity:gltf.opacity,
          side:gltf.side,alphaTest:gltf.alphaTest,toneMapped:false,
        });
        authoredMaterialPalette.set(source,material);
        return material;
      };
      gltfRoot.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        // Material names and base colors come from the actual BIM-derived GLB.
        // Color fidelity fallback: the tested WebGL lit shader whites out even
        // near-black slate materials; render those native swatches unlit until
        // the physical-material pipeline is independently corrected.
        o.material=Array.isArray(o.material)
          ?o.material.map(materialColor):materialColor(o.material);
        // Preserve imported BIM material appearance and restore depth cues.
        // Transparent glazing does not cast opaque shadows on interior surfaces.
        const mats=Array.isArray(o.material)?o.material:[o.material];
        const isGlass=mats.some(m=>m.transparent&&m.opacity<0.98);
        const shadowCategory=String(o.userData?.Category||o.parent?.userData?.Category||'').toLowerCase();
        o.castShadow=!isGlass&&(['wall','roof','gable','door','column','slab'].includes(shadowCategory)||/cedar|boulder|pine|tree|rock/i.test(o.name));
        o.receiveShadow=true;
        const category=String(o.userData?.Category||o.parent?.userData?.Category||'');
        if(['wall','slab','roof','site','door'].includes(category.toLowerCase()))structure.push(o);
      });
      collidersRef.current=structure;
      assetRef.current=gltfRoot;scene.add(gltfRoot);loaded=true;
      const terrainScene=createTerrainProjection(terrainDocRef.current);
      terrainScene.root.position.copy(terrainOrigin.current);
      scene.add(terrainScene.root);terrainProjection.current=terrainScene;
      setReady(true);setProgress('');
    }, progress=>{
      if(progress.total)setProgress('Loading scene '+Math.min(100,Math.floor(100*progress.loaded/progress.total))+'%');
    },e=>{if(alive){setError('Model unavailable: '+String(e));setProgress('')}});
   }catch(e){if(alive){setError(String(e));setProgress('')}}
  };
  void fetchWorld();
  const onKey=(e:KeyboardEvent)=>{if(!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){pressed.current.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();}};
  const onKeyUp=(e:KeyboardEvent)=>pressed.current.delete(e.code);
  window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
  return()=>{
   alive=false;cancelAnimationFrame(animation);observer.disconnect();
   window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKeyUp);
   terrainProjection.current?.dispose();terrainProjection.current=null;
   gltfRoot?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});
   sky.geometry.dispose();sky.material.dispose();
   environmentRef.current=null;
   if(context.domElement.parentElement===host)host.removeChild(context.domElement);
   context.dispose();renderer.current=null;sceneRef.current=null;cameraRef.current=null;
  };
 },[modelUrl,manifestUrl]);
 useEffect(()=>{
  if(!assetRef.current)return;
  assetRef.current.traverse(node=>{
   const cat=String(node.userData?.Category||'').toLowerCase();
   if(/roof|gable/.test(node.name.toLowerCase())||cat==='roof')node.visible=roofVisible;
  });
 },[roofVisible,ready]);
 useEffect(()=>{
  const environment=environmentRef.current,scene=sceneRef.current;
  if(!environment||!scene)return;
  const evening=hour==='evening';
  environment.sun.position.set(evening?-80:80,evening?20:125,evening?65:55);
  environment.sun.intensity=evening?0.55:1.05;
  environment.sun.color.set(evening?'#ffc18d':'#fff0d7');
  environment.fill.intensity=evening?0.3:0.55;
  environment.sky.material.uniforms['sunPosition'].value.copy(environment.sun.position);
  scene.fog=new THREE.Fog(evening?'#596575':'#b5c5cb',260,1150);
 },[hour]);
 useEffect(()=>{
  if(!assetRef.current)return;
  const seen=new Set<THREE.Material>();
  assetRef.current.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   const mats=Array.isArray(o.material)?o.material:[o.material];
   for(const mat of mats){if(seen.has(mat))continue;seen.add(mat);
    if('wireframe' in mat)(mat as THREE.MeshStandardMaterial).wireframe=wireframe;
   }
  });
 },[wireframe,ready]);
 useEffect(()=>{const scene=sceneRef.current;if(scene)scene.background=new THREE.Color(hour==='day'?'#0b1928':'#21172a');},[hour]);
 // Editing always regenerates the complete terrain projection from the same
 // document, so exported JSON and visible relief cannot diverge.
 useEffect(()=>{
  const scene=sceneRef.current;
  if(!scene||!ready)return;
  terrainProjection.current?.dispose();
  const projected=createTerrainProjection(terrain);
  projected.root.position.copy(terrainOrigin.current);
  scene.add(projected.root);terrainProjection.current=projected;
 },[terrain,ready]);
 const pick=useCallback((event:React.PointerEvent<HTMLDivElement>)=>{
  if(!ready||!assetRef.current||!cameraRef.current||!renderer.current)return;
  const rect=renderer.current.domElement.getBoundingClientRect(),nx=(event.clientX-rect.left)/rect.width*2-1,ny=-(event.clientY-rect.top)/rect.height*2+1;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(nx,ny),cameraRef.current);
  const hit=ray.intersectObject(assetRef.current,true)[0]?.object;
  if(!hit)return;
  let o:THREE.Object3D|null=hit;
  while(o&&!o.userData?.DesignId)o=o.parent;
  if(!o)return;
  const selected={designId:String(o.userData.DesignId),category:String(o.userData.Category||'component'),nodeName:o.name,source:String(o.userData.Source||revision)};
  setSelection(selected);onSelect?.(selected);
 },[ready,onSelect]);
 const sculptAt=useCallback((event:React.PointerEvent<HTMLDivElement>,force=false)=>{
  const brush=terrainBrushRef.current,projection=terrainProjection.current,camera=cameraRef.current,webgl=renderer.current;
  if(!brush.mode||!projection||!camera||!webgl)return;
  const now=performance.now();
  if(!force&&now-lastBrushAt.current<90)return;
  const rect=webgl.domElement.getBoundingClientRect();
  const nx=(event.clientX-rect.left)/rect.width*2-1,ny=-(event.clientY-rect.top)/rect.height*2+1;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(nx,ny),camera);
  const intersection=ray.intersectObject(projection.surface,false)[0];
  if(!intersection)return;
  const local=intersection.point.clone().sub(terrainOrigin.current);
  lastBrushAt.current=now;
  setTerrain(current=>addSculptStroke(current,local.x,local.z,brush.radius,brush.strength,brush.mode!));
 },[]);
 const start=useCallback((e:React.PointerEvent<HTMLDivElement>)=>{
  if(e.button!==0&&e.pointerType==='mouse')return;
  if(e.pointerType==='touch'){
   touchPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(touchPointers.current.size===2){const points=[...touchPointers.current.values()];pinchDistance.current=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);pointer.current=null;}
  }
  if(!pointer.current&&touchPointers.current.size<=1)pointer.current={x:e.clientX,y:e.clientY,id:e.pointerId,distance:0};
  e.currentTarget.setPointerCapture(e.pointerId);
  if(terrainBrushRef.current.mode)sculptAt(e,true);
 },[sculptAt]);
 const drag=useCallback((e:React.PointerEvent<HTMLDivElement>)=>{
  if(touchPointers.current.has(e.pointerId)){
   touchPointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(touchPointers.current.size===2){
    const points=[...touchPointers.current.values()],distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
    if(pinchDistance.current&&distance>0&&displayRef.current.mode==='orbit')orbit.current.distance=Math.max(3,Math.min(350,orbit.current.distance*pinchDistance.current/distance));
    pinchDistance.current=distance;return;
   }
  }
  const p=pointer.current;if(!p||p.id!==e.pointerId)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;p.distance+=Math.hypot(dx,dy);
  if(terrainBrushRef.current.mode){sculptAt(e);return;}
  if(displayRef.current.mode==='orbit'){
   orbit.current.az-=dx*ORBIT_SPEED;
   orbit.current.el=Math.max(.045,Math.min(Math.PI/2-.015,orbit.current.el+dy*ORBIT_SPEED));
  }else{
   walk.current.yaw-=dx*.004;
   walk.current.pitch=Math.max(-1.4,Math.min(1.4,walk.current.pitch-dy*.004));
  }
 },[sculptAt]);
 const stop=(e:React.PointerEvent<HTMLDivElement>)=>{
  const wasPinching=pinchDistance.current!==null;
  touchPointers.current.delete(e.pointerId);
  if(touchPointers.current.size<2)pinchDistance.current=null;
  const p=pointer.current;if(p?.id===e.pointerId){if(!wasPinching&&!terrainBrushRef.current.mode&&p.distance<5)pick(e);pointer.current=null}
 };
 return <section className="relative h-full min-h-0 min-w-0 flex-1 bg-[#081321] text-[#e4edf7]" data-cad-world="project-revision" data-world-ready={ready?'true':'false'}>
   <div ref={mount} role="img" aria-label={`${sceneLabel} ${revision} BIM world`}
     className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
     onPointerDown={start} onPointerMove={drag} onPointerUp={stop}
     onWheel={e=>{
       if(displayRef.current.mode!=='orbit')return;
       const extent=modelBounds.current.getSize(new THREE.Vector3()).length();
       const minDistance=Math.max(6,extent*.45);
       const maxDistance=Math.max(250,minDistance*8);
       const step=Math.max(-240,Math.min(240,e.deltaY));
       orbit.current.distance=Math.max(minDistance,Math.min(maxDistance,orbit.current.distance*Math.exp(step*.0015)));
     }}/>
   <details className="cad-world-menu" aria-label="World view settings">
     <summary title="View and environment controls" aria-label="View and environment controls">Views &amp; Scene</summary>
     <div className="cad-world-menu-content">
       <strong>Camera</strong>
       <div className="cad-world-menu-row">
        <button type="button" title="Orbit camera" onClick={()=>setMode('orbit')} aria-pressed={mode==='orbit'}>Orbit</button>
        <button type="button" title="Walk through the BIM" onClick={()=>{walk.current.active=false;setMode('walk')}} aria-pressed={mode==='walk'}>Walk</button>
        <button type="button" title="Frame model" onClick={reset}>Frame model</button>
       </div>
       <div className="cad-world-menu-row" aria-label="Architectural world views">
         {(['iso','plan','front','side'] as const).map(preset=><button key={preset} type="button" title={'View '+preset} onClick={()=>setView(preset)}
          aria-pressed={viewPreset===preset}>{{iso:'Isometric',plan:'Top',front:'Front',side:'Side'}[preset]}</button>)}
       </div>
       <strong>Environment</strong>
       <div className="cad-world-menu-row">
        <button type="button" title="Toggle roof" aria-pressed={!roofVisible} onClick={()=>setRoofVisible(v=>!v)}>Roof {roofVisible?'on':'off'}</button>
        <button type="button" title="Change daylight" onClick={()=>setHour(v=>v==='day'?'evening':'day')}>{hour==='day'?'Daylight':'Evening'}</button>
        <button type="button" title="Toggle wireframe" aria-pressed={wireframe} onClick={()=>setWireframe(v=>!v)}>Wireframe</button>
       </div>
       <label className="cad-world-room">Room <select aria-label="BIM room destinations" defaultValue="" onChange={e=>{const z=handoff?.zones.find(x=>x.roomId===e.target.value);if(z)visit(z)}}>
          <option value="">Choose room</option>{handoff?.zones.map(zone=><option key={zone.roomId} value={zone.roomId}>{zone.label}</option>)}
       </select></label>
       {!readOnly&&<button className="cad-world-action" type="button" title="Edit the real site terrain" aria-pressed={terrainOpen} onClick={()=>{setTerrainOpen(v=>!v);setSelection(null);window.dispatchEvent(new Event('cad:terrain-inspect'))}}>Terrain &amp; Scenery</button>}
       <button className="cad-world-action" type="button" title="Save current view as PNG" disabled={!ready} onClick={exportSnapshot}>Capture PNG</button>
     </div>
   </details>
   {mode==='walk'&&<div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-lg bg-[#111b2c]/85 px-3 py-2 text-center text-xs text-white/90">W A S D · drag to look · Shift to move faster</div>}
   {mode==='walk'&&<div className="absolute bottom-16 left-3 z-20 flex gap-1 sm:hidden">
     {(['KeyW','KeyA','KeyS','KeyD'] as const).map((key,i)=><button key={key} type="button" aria-label={'Move '+['forward','left','back','right'][i]}
       onPointerDown={e=>{e.preventDefault();pressed.current.add(key)}} onPointerUp={()=>pressed.current.delete(key)} onPointerCancel={()=>pressed.current.delete(key)}
       className="rounded-lg border border-white/20 bg-slate-800/90 px-3 py-2.5 text-xs font-bold">{['↑','←','↓','→'][i]}</button>)}
   </div>}
   {!readOnly&&terrainOpen&&<TerrainEditorPanel document={terrain} onChange={setTerrain} sculptMode={sculptMode} onSculptMode={next=>{setSculptMode(next);if(next)setMode('orbit')}}
     brushRadius={brushRadius} onBrushRadius={setBrushRadius} brushStrength={brushStrength} onBrushStrength={setBrushStrength}
     onFitSite={fitSite} onClose={()=>{setTerrainOpen(false);setSculptMode(null)}}/>}
   {!terrainOpen&&selection&&<aside className="absolute bottom-12 right-3 z-20 w-[min(310px,70vw)] rounded-lg border border-white/20 bg-[#101a2b]/95 p-3 text-xs shadow-xl" aria-label="Selected BIM element">
     <div className="flex justify-between gap-2"><strong>BIM · {selection.category}</strong><button onClick={()=>setSelection(null)} aria-label="Close BIM inspector">×</button></div>
     <p className="mt-1 break-all font-mono text-sky-200">{selection.designId}</p>
     <p className="mt-1 text-slate-400">{selection.nodeName} · {selection.source}</p>
   </aside>}
   {(progress||error)&&<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/20 bg-[#101a2b]/95 px-5 py-4 text-center text-sm" role="status">{error||progress}</div>}

 </section>;
}