import {nativeHistory,planFeatures} from '@inneranimalmedia/agentsam-cad-shared';
export {nativeHistory,planFeatures} from '@inneranimalmedia/agentsam-cad-shared';
import type {ProjectState} from '@inneranimalmedia/agentsam-cad-shared';
import {AGENTSAM_PREVIEW_BRIDGE_CHANNEL,isAllowedBridgeMessage} from './agentsam-preview-bridge';
export type NativeMesh={id:string;positions:number[];normals:number[];indices:number[];units:'mm';axes:'z-up';volume_mm3:number;revision:number};
/** Called in the same state transaction as a plan edit, so one undo step restores
 * both the plan and the native event cursor. There is no second project tree. */
export function recordNativePlanChange(previous:ProjectState,next:ProjectState):ProjectState{
 if(previous.id!==next.id)return next;
 if(JSON.stringify(planFeatures(previous))===JSON.stringify(planFeatures(next)))return next;
 const history=nativeHistory(previous),operations=history.operations.slice(0,history.cursor);
 operations.push({type:'$syncPlan',operations:planFeatures(next)});
 return {...next,nativeHistory:{version:1,operations,cursor:operations.length}};
}
export function requestNativeEngine(projectId:string,request:Record<string,unknown>):Promise<any>{
 const invoke=(window as unknown as {__TAURI__?:{core?:{invoke?:(command:string,args:unknown)=>Promise<unknown>}}}).__TAURI__?.core?.invoke;
 if(invoke)return invoke('cad_engine_request',{projectId,request});
 if(window.parent===window)return Promise.reject(new Error('native_cad_requires_desktop_host'));
 return new Promise((resolve,reject)=>{
  const requestId=crypto.randomUUID();
  const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
  const receive=(event:MessageEvent)=>{if(!isAllowedBridgeMessage(event,[window.location.origin])||event.data.type!=='cad.engine.response'||event.data.request_id!==requestId)return;cleanup();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);};
  const timer=setTimeout(()=>{cleanup();reject(new Error('native_cad_host_timeout'));},35000);
  window.addEventListener('message',receive);
  window.parent.postMessage({channel:AGENTSAM_PREVIEW_BRIDGE_CHANNEL,version:1,type:'cad.engine.request',request_id:requestId,project_id:projectId,request},window.location.origin);
 });
}
// Serializes open + read operations across the viewport and inspector. A stale
// render cannot replace the model halfway through another request sequence.
let tasks:Promise<unknown>=Promise.resolve();
export function withNativeProject<T>(project:ProjectState,read:(request:(r:Record<string,unknown>)=>Promise<any>)=>Promise<T>):Promise<T>{
 const work=async()=>{const h=nativeHistory(project);const request=(r:Record<string,unknown>)=>requestNativeEngine(project.id,r);await request({action:'open',operations:h.operations,cursor:h.cursor});return read(request);};
 const result=tasks.then(work);tasks=result.catch(()=>{});return result;
}
export async function projectSolidMeshes(project:ProjectState):Promise<NativeMesh[]>{
 const isStandalone=window.parent===window && !((window as unknown as {__TAURI__?:unknown}).__TAURI__);
 if(isStandalone && ['127.0.0.1','localhost','::1'].includes(window.location.hostname)){
  const response=await fetch('/api/cad/project/native/evaluate',{
   method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({project})
  });
  const raw=await response.text();
  let result:any;
  try{result=raw.trim()?JSON.parse(raw):null}
  catch{throw new Error('Local CAD engine returned invalid JSON (HTTP '+response.status+'). Restart the local CAD service.')}
  if(!result)throw new Error('Local CAD engine returned an empty response (HTTP '+response.status+').');
  if(!response.ok||result?.engine!=='occt'||result?.verified!==true||!Array.isArray(result.meshes))
   throw new Error(result?.error||'native_wall_evaluation_failed');
  return result.meshes as NativeMesh[];
 }
 return withNativeProject(project,async request=>{const output:NativeMesh[]=[];for(const wall of project.walls)output.push(await request({action:'mesh',id:wall.id}));return output;});
}
export function exportNativeElement(project:ProjectState,id:string,format:string,view?:'plan'|'section'|'elevation'){
 const wall=project.walls.find(w=>w.id===id);
 const dx=wall?wall.x2-wall.x1:1,dy=wall?wall.y2-wall.y1:0;
 const origin=wall?[(wall.x1+wall.x2)*12.7,(wall.y1+wall.y2)*12.7,1200]:[0,0,1200];
 return withNativeProject(project,request=>request({action:'export',id,format,saveAs:true,...(format==='svg'?{mode:view==='elevation'?'projection':'section',origin,direction:view==='plan'?[0,0,1]:[dy,-dx,0]}:{})}));
}
