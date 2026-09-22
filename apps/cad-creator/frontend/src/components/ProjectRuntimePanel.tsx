import React, {useState,useEffect,useRef} from 'react';
import type {DesignProject} from '@inneranimalmedia/agentsam-cad-shared';
export function ProjectRuntimePanel({project,onLoad,readOnly=false}:{project:DesignProject;onLoad:(p:DesignProject)=>void;readOnly?:boolean}){
 const [revision,setRevision]=useState(0),[status,setStatus]=useState('Unsaved'),[busy,setBusy]=useState(false),[loadId,setLoadId]=useState(project.id),[restoreRevision,setRestoreRevision]=useState('1');
 const [artifact,setArtifact]=useState('');
 const current=useRef(project),synced=useRef(''),adoptedId=useRef('');
 current.current=project;
 async function call(name:string,args:any){const res=await fetch('/api/cad/project/tools/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});const body=await res.json();if(!res.ok||!body.ok)throw new Error(body.error||'Project operation failed');return body.result;}
 function adopt(row:any){synced.current=JSON.stringify(row.project);adoptedId.current=row.project.id;setRevision(row.revision);onLoad(row.project);}
 useEffect(()=>{let cancelled=false;setLoadId(project.id);setArtifact('');
  if(adoptedId.current===project.id)return;
  setRevision(0);synced.current='';
  call('design_project_get',{project_id:project.id}).then(row=>{
   if(cancelled)return;
   if(JSON.stringify(current.current)===JSON.stringify(row.project)){synced.current=JSON.stringify(row.project);setRevision(row.revision);setStatus('Revision '+row.revision);}
   else setStatus('A saved project exists. Open saved before overwriting it.');
  }).catch(()=>{if(!cancelled)setStatus('Unsaved');});return()=>{cancelled=true;};
 },[project.id]);
 useEffect(()=>{const events=new EventSource('/api/cad/project/events');events.onmessage=e=>{
  const row=JSON.parse(e.data);if(row.project.id!==current.current.id)return;
  const next=JSON.stringify(row.project),local=JSON.stringify(current.current);
  if(local!==next&&local!==synced.current){setStatus('External revision '+row.revision+' available. Local edits retained; reopen to reconcile.');return;}
  synced.current=next;adoptedId.current=row.project.id;setRevision(row.revision);onLoad(row.project);setStatus('Revision '+row.revision);
 };return()=>events.close();},[onLoad]);
 async function run(action:string){if(readOnly&&action!=='load')return;setBusy(true);setArtifact('');try{
  if(action==='load'){const r=await call('design_project_get',{project_id:loadId});adopt(r);setStatus('Loaded revision '+r.revision);}
  if(action==='save'||action==='render'){const r=await call('design_project_save',{project,expected_revision:revision});adopt(r);setStatus('Saved revision '+r.revision);
   if(action==='render'){const input={project_id:project.id,revision:r.revision};await call('design_model_build',input);await call('design_model_inspect',input);await call('design_model_export',{...input,format:'glb'});await call('design_model_render',input);setArtifact('/api/cad/project/artifact/'+project.id+'/'+r.revision+'/courtyard.png');setStatus('Built and rendered revision '+r.revision);}
  }
  if(action==='restore'){const r=await call('design_project_restore',{project_id:project.id,revision:Number(restoreRevision),expected_revision:revision});adopt(r);setStatus('Restored as revision '+r.revision);}
 }catch(e:any){setStatus(e.message);}finally{setBusy(false);}}
 return <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs bg-slate-900 text-white">
  <input aria-label="Project ID" className="text-black px-1" value={loadId} onChange={e=>setLoadId(e.target.value)}/>
  <button disabled={busy} onClick={()=>run('load')}>Open saved</button><button disabled={busy||readOnly} onClick={()=>run('save')}>Save revision</button>
  <input aria-label="Revision to restore" type="number" min="1" className="text-black w-12" value={restoreRevision} onChange={e=>setRestoreRevision(e.target.value)}/>
  <button disabled={busy||readOnly||revision===0} onClick={()=>run('restore')}>Restore</button><button disabled={busy||readOnly} onClick={()=>run('render')}>Build & render</button>
  <span role="status">{busy?'Working…':status}</span>{artifact&&<a href={artifact} target="_blank" rel="noreferrer">View courtyard render</a>}
 </div>;
}
