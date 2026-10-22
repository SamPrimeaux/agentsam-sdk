import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { gunzipSync } from "fflate";

const configuredAssetBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL || "./";
function assetUrl(path:string):string{
 const runtimeUrl=typeof window!=="undefined"?window.location.href:"http://localhost/";
 const baseUrl=new URL(configuredAssetBase,runtimeUrl);
 return new URL(path.replace(/^\/+/, ""),baseUrl).href;
}
export type TemplateDefinition = {
 id:string; name:string; category:"Sculpt"|"Composition"|"Editorial"; preview:string; parts:string[]; tone:string;
};

const composite:Record<string,string[]>={
 "layers-midnight":["layers-midnight-workspace","layers-midnight-memory","layers-midnight-tools","layers-midnight-agent"],
 "tiles-luminous":["tiles-luminous-brand","tiles-luminous-build","tiles-luminous-support"],
 "cards-luminous":["cards-luminous-api","cards-luminous-memory","cards-luminous-tools","cards-luminous-agent","cards-luminous-api-text","cards-luminous-agent-text"],
 "cards-original":["cards-original-api","cards-original-memory","cards-original-tools","cards-original-agent","cards-original-api-text","cards-original-agent-text"],
};
const authoredNames=[
 "bowl","stack","cluster","ribbon","knot","arch","twist","links","orbit-luminous","orbit-midnight",
 "layers-midnight","tiles-luminous","pills-editorial","cluster-duo","cluster-duo-midnight",
 "cluster-duo-original","ringball","domes","cards-luminous","cards-original"
] as const;
export const templateCatalog:TemplateDefinition[]=authoredNames.map((id,index)=>({
 id,name:id.replaceAll("-"," ").replace(/\b\w/g,m=>m.toUpperCase()),
 category:index<8||index>=16&&index<=17?"Sculpt":composite[id]?"Composition":"Editorial",
 preview:`web/${id}.webp`,
 parts:composite[id]||[id],
 tone:id.includes("midnight")?"midnight":id.includes("original")?"original":"luminous",
}));
export const findTemplate=(id:string)=>templateCatalog.find(t=>t.id===id);
const loader=new STLLoader();
const geometryCache=new Map<string,THREE.BufferGeometry>();
const pending=new Map<string,Promise<THREE.BufferGeometry>>();
async function partGeometry(id:string):Promise<THREE.BufferGeometry>{
 const cached=geometryCache.get(id);if(cached)return cached;
 const existing=pending.get(id);if(existing)return existing;
 const task=(async()=>{
  const response=await fetch(assetUrl("stl/"+id+".stl.gz"));
  if(!response.ok)throw Error("Source STL unavailable: "+id);
  const compressed=await response.arrayBuffer();
  let geometryBytes:ArrayBuffer;
  if(typeof DecompressionStream==="function"){
   try{
    geometryBytes=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
   }catch{
    const inflated=gunzipSync(new Uint8Array(compressed));
    geometryBytes=inflated.buffer.slice(inflated.byteOffset,inflated.byteOffset+inflated.byteLength);
   }
  }else{
   const inflated=gunzipSync(new Uint8Array(compressed));
   geometryBytes=inflated.buffer.slice(inflated.byteOffset,inflated.byteOffset+inflated.byteLength);
  }
  const geo=loader.parse(geometryBytes);
  geo.computeVertexNormals();
  geometryCache.set(id,geo);
  return geo;
 })().finally(()=>pending.delete(id));
 pending.set(id,task);return task;
}
const toneColors:Record<string,string[]>={
 luminous:["#f2f4ff","#dce7ff","#7e9df2","#aabef6","#f8fbff","#4878f0"],
 midnight:["#223352","#354d80","#527fe2","#6f95da","#cedaf6","#8fb1ff"],
 original:["#dcd7f9","#8b5cf6","#7866c8","#f7f3ff","#a99cdb","#c4b5fd"],
};
const modelCache=new Map<string,THREE.Group>();
const tasks=new Map<string,Promise<THREE.Group>>();
export async function getTemplateModel(id:string):Promise<THREE.Group>{
 const model=modelCache.get(id);if(model)return model;
 const task=tasks.get(id);if(task)return task;
 const sourcePartId=id.startsWith("part:")?id.slice(5):null;
 const entry=sourcePartId?undefined:findTemplate(id);
 const partIds=entry?.parts||(sourcePartId?[sourcePartId]:null);
 if(!partIds)throw Error("Unknown source-backed model: "+id);
 const operation=Promise.all(partIds.map(partGeometry)).then(geometries=>{
  const group=new THREE.Group();
  const palette=toneColors[entry?.tone||"luminous"]||toneColors.luminous;
  geometries.forEach((geometry,i)=>{
   const color=palette[i%palette.length];
   const mat=new THREE.MeshStandardMaterial({color,roughness:.56,metalness:0,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(geometry,mat);
   mesh.name=partIds[i];mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  });
  // Source STL is Z-up and keeps its authored geometry. Only the scene
  // instance is oriented and scaled for inspection; source bytes are read-only.
  group.rotation.x=-Math.PI/2;
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group);
  const size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  const factor=3.2/Math.max(size.x,size.y,size.z,0.001);
  group.position.set(-center.x*factor,-center.y*factor,-center.z*factor);
  group.scale.setScalar(factor);
  group.updateMatrixWorld(true);
  modelCache.set(id,group);
  return group;
 }).finally(()=>tasks.delete(id));
 tasks.set(id,operation);
 return operation;
}
export function cachedTemplateModel(id:string){return modelCache.get(id);}
export function instanceTemplateModel(id:string,color?:string,wireframe=false,look:"clay"|"glass"|"metal"="clay"):THREE.Group|undefined{
 const source=cachedTemplateModel(id);if(!source)return;
 const instance=source.clone(true);
 instance.traverse(o=>{
  if(!(o instanceof THREE.Mesh))return;
  o.userData.sharedTemplateGeometry=true;
  o.material=(o.material as THREE.MeshStandardMaterial).clone();
  const mat=o.material as THREE.MeshStandardMaterial;
  if(color)mat.color.set(color);
  mat.wireframe=wireframe;
  if(look==="metal"){mat.metalness=.72;mat.roughness=.23;}
  if(look==="glass"){mat.transparent=true;mat.opacity=.6;mat.depthWrite=false;mat.roughness=.12;}
 });
 return instance;
}
