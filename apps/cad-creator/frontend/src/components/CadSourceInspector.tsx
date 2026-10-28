import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createThreeViewport} from '@inneranimalmedia/agentsam-3d-viewer';
import {Box,Code,ExternalLink,FileDown,FolderOpen,Image as ImageIcon,RefreshCw} from 'lucide-react';

export type CadDiscoveredSource={
 id:string;project:string;revision:string;relativePath:string;format:string;
 role:string;status:string;bytes:number;sha256:string;
};
const url=(id:string,action:string)=>'/api/cad/sources/'+encodeURIComponent(id)+'/'+action;
const nativeFor=(type:string):string|null=>({
 FCSTD:'FreeCAD',IFC:'FreeCAD',STEP:'FreeCAD',STP:'FreeCAD',DXF:'FreeCAD',DWG:'FreeCAD',
 BLEND:'Blender',GLB:'Blender',GLTF:'Blender',SCAD:'OpenSCAD'
} as Record<string,string>)[type]||null;
const imageTypes=new Set(['PNG','JPG','JPEG','WEBP']);
function disposeScene(node:THREE.Object3D){
 node.traverse(child=>{
  if(!(child instanceof THREE.Mesh))return;
  child.geometry.dispose();
  const materials=Array.isArray(child.material)?child.material:[child.material];
  for(const material of materials)material.dispose();
 });
}
function VerifiedGlbPreview({id}:{id:string}){
 const ref=useRef<HTMLDivElement>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const host=ref.current;if(!host)return;
  let active=true,model:THREE.Object3D|null=null;
  setError('');
  const viewport=createThreeViewport(host,{THREE,OrbitControls},{wrapper:false,background:'#151e2b',
    near:.01,far:20000,fov:48,maxPixelRatio:2,enableDamping:true,lights:true});
  new GLTFLoader().load(url(id,'preview'),gltf=>{
   if(!active){disposeScene(gltf.scene);return}
   model=gltf.scene;viewport.scene.add(model);viewport.fit(model);
  },undefined,()=>{if(active)setError('Could not load this GLB source.')});
  return ()=>{
   active=false;
   if(model){viewport.scene.remove(model);disposeScene(model)}
   viewport.dispose();
  };
 },[id]);
 return <div className="relative h-full min-h-80 w-full rounded-lg border border-slate-700 overflow-hidden">
  <div ref={ref} className="absolute inset-0"/>
  <div className="pointer-events-none absolute bottom-2 left-2 bg-slate-950/80 rounded px-2 py-1 text-xs text-slate-300">Orbit · zoom · inspect source GLB</div>
  {error&&<div className="absolute top-3 left-3 bg-rose-950 rounded p-2 text-xs text-rose-200">{error}</div>}
 </div>;
}
export function CadSourceInspector({source,onBack}:{source:CadDiscoveredSource;onBack:()=>void}){
 const [content,setContent]=useState(''),[loading,setLoading]=useState(false),[message,setMessage]=useState('');
 const native=nativeFor(source.format);
 useEffect(()=>{
  setContent('');setMessage('');
  if(source.format!=='SCAD'&&source.format!=='JSON')return;
  const controller=new AbortController();setLoading(true);
  fetch(url(source.id,'text'),{signal:controller.signal,credentials:'same-origin'})
   .then(async response=>{if(!response.ok)throw Error('Source preview unavailable (HTTP '+response.status+')');return response.text()})
   .then(setContent).catch(error=>{if(!controller.signal.aborted)setMessage(error.message)})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return ()=>controller.abort();
 },[source.id,source.format]);
 const openNative=async()=>{
  setMessage('');
  try{
   const result=await fetch(url(source.id,'open-native'),{method:'POST',credentials:'same-origin'});
   const data=await result.json();
   if(!result.ok)throw Error(data.error||'Native application could not open this source.');
   setMessage('Requested source open in '+data.application+'.');
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}
 };
 const isPreview=source.format==='GLB'||imageTypes.has(source.format);
 return <section className="flex min-h-0 flex-1 flex-col bg-[#111827] text-slate-100">
  <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
   <button className="rounded border border-white/20 px-3 py-2 text-xs" onClick={onBack}>Back to source library</button>
   <strong className="text-sm break-all">{source.relativePath.split('/').pop()}</strong>
   <span className="text-xs text-slate-400">{source.project} · {source.revision} · {source.format}</span>
  </header>
  <div className="flex flex-col lg:flex-row flex-1 min-h-0 gap-3 p-3 overflow-y-auto">
   <div className="flex-1 min-h-80">
    {source.format==='GLB'?<VerifiedGlbPreview id={source.id}/>:
     imageTypes.has(source.format)?
       <div className="h-full min-h-80 bg-slate-950 rounded-lg border border-slate-700 flex items-center justify-center">
        <img src={url(source.id,'preview')} alt={source.relativePath} className="max-w-full max-h-full object-contain"/>
       </div>:
     ['SCAD','JSON'].includes(source.format)?
       <div className="h-full rounded-lg border border-slate-700 overflow-hidden bg-slate-950">
        <div className="p-2 border-b border-slate-700 text-xs text-slate-400 flex gap-2"><Code size={14}/> Read-only source · Edit in native application</div>
        <pre className="p-3 text-xs text-sky-200 whitespace-pre-wrap break-words overflow-auto max-h-full">{loading?'Loading source…':content||'No inline preview available'}</pre>
       </div>:
       <div className="h-full min-h-80 rounded-lg border border-slate-700 bg-slate-950 flex flex-col items-center justify-center gap-3 text-center p-5">
        <Box size={34} className="text-slate-400"/>
        <strong>Native {source.format} source</strong>
        <p className="max-w-md text-xs text-slate-400">The file is indexed and hash-identified, but no derived 3D preview has been verified for this revision. Open it in its native modeling tool; the application will not invent editable geometry.</p>
       </div>}
   </div>
   <aside className="w-full lg:w-80 flex-shrink-0 space-y-3">
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2 text-xs">
     <h3 className="font-semibold text-sm flex items-center gap-2"><FolderOpen size={16}/> Source information</h3>
     <div className="flex justify-between gap-2"><span className="text-slate-400">Role</span><strong>{source.role}</strong></div>
     <div className="flex justify-between gap-2"><span className="text-slate-400">Readiness</span><strong>{source.status}</strong></div>
     <div className="flex justify-between gap-2"><span className="text-slate-400">Size</span><strong>{(source.bytes/1024/1024).toFixed(2)} MB</strong></div>
     <div className="text-slate-400">SHA-256</div>
     <div className="font-mono break-all text-sky-200">{source.sha256}</div>
     <div className="text-slate-400">Source-relative path</div>
     <div className="break-all">{source.relativePath}</div>
     <p className="text-amber-200">A presentation asset is not an editable BIM or exact native solid merely because its mesh can be displayed.</p>
    </div>
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 space-y-2">
     {native&&<button className="w-full bg-sky-700 rounded px-3 py-2 text-xs font-semibold flex items-center justify-center gap-2"
      onClick={()=>void openNative()}><ExternalLink size={14}/> Open in {native}</button>}
     <a className="w-full border border-slate-600 rounded px-3 py-2 text-xs flex items-center justify-center gap-2"
      href={url(source.id,'download')}><FileDown size={14}/> Download original</a>
     {isPreview&&<p className="text-xs text-slate-400 flex items-center gap-2"><ImageIcon size={13}/> Preview reads source bytes, not a substitute BIM revision.</p>}
     {message&&<div role="status" className="rounded bg-slate-950 p-2 text-xs text-amber-200">{message}</div>}
    </div>
   </aside>
  </div>
 </section>;
}
