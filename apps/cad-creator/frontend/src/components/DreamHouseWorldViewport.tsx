import {useCallback,useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const ORIGIN='https://cad.inneranimalmedia.com/api/cad/public-world/dreamhouse/v1.1';
type Zone={roomId:string;label:string;candidateCameraBlenderXYZMetres?:number[];anchorStatus?:string};
type Handoff={projectId:string;sceneRevision:string;scene:{nodeCount:number;architectureNodeCount:number;glbSha256:string};zones:Zone[]};
type Selected={designId:string;category:string;nodeName:string;source:string};
type CameraMode='orbit'|'walk';
const POSKEY='agentsam.dreamhouse.camera.v1.1';
const ORBIT_SPEED=0.007;

export function DreamHouseWorldViewport({onSelect}: {onSelect?:(s:Selected)=>void}) {
 const mount=useRef<HTMLDivElement>(null),renderer=useRef<THREE.WebGLRenderer|null>(null),
 sceneRef=useRef<THREE.Scene|null>(null),cameraRef=useRef<THREE.PerspectiveCamera|null>(null);
 const assetRef=useRef<THREE.Object3D|null>(null),collidersRef=useRef<THREE.Object3D[]>([]);
 const target=useRef(new THREE.Vector3()),orbit=useRef({az:0.9,el:0.65,distance:65});
 const walk=useRef({yaw:0,pitch:0,position:new THREE.Vector3(),active:false});
 const pressed=useRef(new Set<string>()),pointer=useRef<{x:number;y:number;id:number}|null>(null);
 const [mode,setMode]=useState<CameraMode>('orbit'),[ready,setReady]=useState(false),
 [error,setError]=useState(''),[progress,setProgress]=useState('Resolving DreamHouse V1.1…'),
 [handoff,setHandoff]=useState<Handoff|null>(null),[selection,setSelection]=useState<Selected|null>(null),
 [roofVisible,setRoofVisible]=useState(true),[hour,setHour]=useState<'day'|'evening'>('day');
 const bounds=useRef(new THREE.Box3());
 const displayRef=useRef({mode,roofVisible,hour});
 useEffect(()=>{displayRef.current={mode,roofVisible,hour}},[mode,roofVisible,hour]);
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
  if(bounds.current.isEmpty())return;
  const center=target.current.clone(),size=bounds.current.getSize(new THREE.Vector3());
  target.current.copy(center);
  orbit.current={az:0.85,el:0.5,distance:Math.max(12,size.length()*0.48)};
  walk.current.position.set(center.x,Math.max(1.7,bounds.current.min.y+1.7),center.z);
  setMode('orbit');
 };
 useEffect(()=>{
  const host=mount.current;if(!host)return;
  let alive=true;
  let gltfRoot:THREE.Object3D|null=null;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#0a1420');sceneRef.current=scene;
  const camera=new THREE.PerspectiveCamera(56,1,.06,2400);cameraRef.current=camera;
  const context=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',alpha:false});
  context.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  context.outputColorSpace=THREE.SRGBColorSpace;context.toneMapping=THREE.ACESFilmicToneMapping;
  context.toneMappingExposure=0.75;
  renderer.current=context;host.appendChild(context.domElement);
  const sun=new THREE.DirectionalLight('#fff2e1',1.85);sun.position.set(18,50,40);scene.add(sun);
  scene.add(new THREE.HemisphereLight('#d9e8ff','#405143',1.05));
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
        const ground=floorRay.intersectObjects(collidersRef.current,false)
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
    const manifestResponse=await fetch(ORIGIN+'/manifest.json');
    if(!manifestResponse.ok)throw Error('Scene manifest unavailable ('+manifestResponse.status+')');
    const manifest: Handoff=await manifestResponse.json();
    if(!alive)return;setHandoff(manifest);setProgress('Streaming verified V1.1 geometry…');
    new GLTFLoader().load(ORIGIN+'/model.glb', gltf=>{
      if(!alive)return;
      gltfRoot=gltf.scene;
      const box=new THREE.Box3().setFromObject(gltfRoot);
      if(box.isEmpty())throw Error('DreamHouse GLB contains no geometry');
      bounds.current.copy(box);
      // Frame the real architecture, not the full parcel's Ground mesh;
      // the previous fit made the house a tiny speck on a bright field.
      const architectureBox=new THREE.Box3();
      gltfRoot.traverse(node=>{
        const category=String(node.userData?.Category||'').toLowerCase();
        if(node instanceof THREE.Mesh&&['wall','window','door','roof','slab'].includes(category))
          architectureBox.expandByObject(node);
        if(node instanceof THREE.Mesh&&node.name==='Ground'){
          node.material=new THREE.MeshStandardMaterial({color:'#516751',roughness:1,metalness:0});
        }
      });
      const focusBox=architectureBox.isEmpty()?box:architectureBox;
      const center=focusBox.getCenter(new THREE.Vector3()),size=focusBox.getSize(new THREE.Vector3());
      target.current.copy(center);
      orbit.current={az:.88,el:.49,distance:Math.max(11,size.length()*.56)};
      walk.current.position.set(center.x,Math.max(1.65,box.min.y+1.65),center.z);
      const structure:THREE.Object3D[]=[];
      gltfRoot.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        o.castShadow=false;o.receiveShadow=false;
        const category=String(o.userData?.Category||o.parent?.userData?.Category||'');
        if(['wall','slab','roof','site','door'].includes(category.toLowerCase()))structure.push(o);
      });
      collidersRef.current=structure;
      assetRef.current=gltfRoot;scene.add(gltfRoot);loaded=true;
      setReady(true);setProgress('');
    }, progress=>{
      if(progress.total)setProgress('Loading scene '+Math.min(100,Math.floor(100*progress.loaded/progress.total))+'%');
    },e=>{if(alive){setError('DreamHouse model unavailable: '+String(e));setProgress('')}});
   }catch(e){if(alive){setError(String(e));setProgress('')}}
  };
  void fetchWorld();
  const onKey=(e:KeyboardEvent)=>{if(!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){pressed.current.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();}};
  const onKeyUp=(e:KeyboardEvent)=>pressed.current.delete(e.code);
  window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
  return()=>{
   alive=false;cancelAnimationFrame(animation);observer.disconnect();
   window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKeyUp);
   gltfRoot?.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}});
   if(context.domElement.parentElement===host)host.removeChild(context.domElement);
   context.dispose();renderer.current=null;sceneRef.current=null;cameraRef.current=null;
  };
 },[]);
 useEffect(()=>{
  if(!assetRef.current)return;
  assetRef.current.traverse(node=>{
   const cat=String(node.userData?.Category||'').toLowerCase();
   if(/roof|gable/.test(node.name.toLowerCase())||cat==='roof')node.visible=roofVisible;
  });
 },[roofVisible,ready]);
 useEffect(()=>{const scene=sceneRef.current;if(scene)scene.background=new THREE.Color(hour==='day'?'#0b1928':'#21172a');},[hour]);
 const pick=useCallback((event:React.PointerEvent<HTMLDivElement>)=>{
  if(!ready||!assetRef.current||!cameraRef.current||!renderer.current)return;
  const rect=renderer.current.domElement.getBoundingClientRect(),nx=(event.clientX-rect.left)/rect.width*2-1,ny=-(event.clientY-rect.top)/rect.height*2+1;
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(nx,ny),cameraRef.current);
  const hit=ray.intersectObject(assetRef.current,true)[0]?.object;
  if(!hit)return;
  let o:THREE.Object3D|null=hit;
  while(o&&!o.userData?.DesignId)o=o.parent;
  if(!o)return;
  const selected={designId:String(o.userData.DesignId),category:String(o.userData.Category||'component'),nodeName:o.name,source:String(o.userData.Source||'FreeCAD / V1')};
  setSelection(selected);onSelect?.(selected);
 },[ready,onSelect]);
 const start=useCallback((e:React.PointerEvent<HTMLDivElement>)=>{
  if(e.button!==0&&e.pointerType==='mouse')return;
  pointer.current={x:e.clientX,y:e.clientY,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);
 },[]);
 const drag=useCallback((e:React.PointerEvent<HTMLDivElement>)=>{
  const p=pointer.current;if(!p||p.id!==e.pointerId)return;
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  if(displayRef.current.mode==='orbit'){
   orbit.current.az-=dx*ORBIT_SPEED;
   orbit.current.el=Math.max(.045,Math.min(Math.PI/2-.015,orbit.current.el+dy*ORBIT_SPEED));
  }else{
   walk.current.yaw-=dx*.004;
   walk.current.pitch=Math.max(-1.4,Math.min(1.4,walk.current.pitch-dy*.004));
  }
 },[]);
 const stop=(e:React.PointerEvent<HTMLDivElement>)=>{const p=pointer.current;if(p?.id===e.pointerId){if(Math.abs(e.movementX||0)<4)pick(e);pointer.current=null}};
 return <section className="relative h-full min-h-0 min-w-0 flex-1 bg-[#081321] text-[#e4edf7]" data-cad-world="dreamhouse-v1.1" data-world-ready={ready?'true':'false'}>
   <div ref={mount} role="img" aria-label="DreamHouse V1.1 interactive BIM world"
     className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
     onPointerDown={start} onPointerMove={drag} onPointerUp={stop}
     onWheel={e=>{if(displayRef.current.mode==='orbit')orbit.current.distance=Math.max(3,Math.min(250,orbit.current.distance*(e.deltaY>0?1.11:.90)))}}/>
   <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start justify-between gap-2">
     <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border border-white/15 bg-[#111b2c]/90 p-1 text-xs shadow-xl backdrop-blur-md">
       <span className="px-2 font-semibold">DreamHouse V1.1</span>
       <button type="button" onClick={()=>setMode('orbit')} aria-pressed={mode==='orbit'} className={'rounded px-2 py-1.5 '+(mode==='orbit'?'bg-sky-600 text-white':'hover:bg-white/10')}>Orbit</button>
       <button type="button" onClick={()=>{walk.current.active=false;setMode('walk')}} aria-pressed={mode==='walk'} className={'rounded px-2 py-1.5 '+(mode==='walk'?'bg-sky-600 text-white':'hover:bg-white/10')}>Walk</button>
       <button type="button" onClick={()=>setRoofVisible(v=>!v)} aria-pressed={!roofVisible} className="rounded px-2 py-1.5 hover:bg-white/10">Roof {roofVisible?'on':'off'}</button>
       <button type="button" onClick={()=>setHour(v=>v==='day'?'evening':'day')} className="rounded px-2 py-1.5 hover:bg-white/10">{hour==='day'?'Daylight':'Evening'}</button>
       <button type="button" onClick={reset} className="rounded px-2 py-1.5 hover:bg-white/10">Reset view</button>
     </div>
     <select aria-label="DreamHouse room destinations" className="pointer-events-auto max-w-[180px] rounded-lg border border-white/15 bg-[#111b2c]/95 px-2 py-2 text-xs text-slate-100" defaultValue="" onChange={e=>{const z=handoff?.zones.find(x=>x.roomId===e.target.value);if(z)visit(z)}}>
       <option value="">Explore rooms</option>{handoff?.zones.map(zone=><option key={zone.roomId} value={zone.roomId}>{zone.roomId} — {zone.label}</option>)}
     </select>
   </div>
   {mode==='walk'&&<div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-lg bg-[#111b2c]/85 px-3 py-2 text-center text-xs text-white/90">W A S D · drag to look · Shift to move faster</div>}
   {mode==='walk'&&<div className="absolute bottom-16 left-3 z-20 flex gap-1 sm:hidden">
     {(['KeyW','KeyA','KeyS','KeyD'] as const).map((key,i)=><button key={key} type="button" aria-label={'Move '+['forward','left','back','right'][i]}
       onPointerDown={e=>{e.preventDefault();pressed.current.add(key)}} onPointerUp={()=>pressed.current.delete(key)} onPointerCancel={()=>pressed.current.delete(key)}
       className="rounded-lg border border-white/20 bg-slate-800/90 px-3 py-2.5 text-xs font-bold">{['↑','←','↓','→'][i]}</button>)}
   </div>}
   {selection&&<aside className="absolute bottom-12 right-3 z-20 w-[min(310px,70vw)] rounded-lg border border-white/20 bg-[#101a2b]/95 p-3 text-xs shadow-xl" aria-label="Selected BIM element">
     <div className="flex justify-between gap-2"><strong>FreeCAD BIM · {selection.category}</strong><button onClick={()=>setSelection(null)} aria-label="Close BIM inspector">×</button></div>
     <p className="mt-1 break-all font-mono text-sky-200">{selection.designId}</p>
     <p className="mt-1 text-slate-400">{selection.nodeName} · {selection.source}</p>
   </aside>}
   {(progress||error)&&<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/20 bg-[#101a2b]/95 px-5 py-4 text-center text-sm" role="status">{error||progress}</div>}
   {ready&&<div className="pointer-events-none absolute bottom-2 right-3 rounded bg-[#111b2c]/85 px-3 py-1.5 text-[10px] tracking-wide text-slate-300">
     Published world · {handoff?.scene.architectureNodeCount} BIM nodes · {handoff?.zones.length} rooms · {handoff?.sceneRevision}
   </div>}
 </section>;
}
