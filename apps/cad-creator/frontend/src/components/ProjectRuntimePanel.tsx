import React, {useState,useEffect,useRef} from 'react';
import type {DesignProject} from '@inneranimalmedia/agentsam-cad-shared';
export function ProjectRuntimePanel({project,onLoad,readOnly=false,onVerifiedRevision}:{project:DesignProject;onLoad:(p:DesignProject)=>void;readOnly?:boolean;onVerifiedRevision?:(revision:number|null,projectId:string)=>void}){
 const [revision,setRevision]=useState(0),[status,setStatus]=useState('Unsaved'),[busy,setBusy]=useState(false),[loadId,setLoadId]=useState(project.id),[restoreRevision,setRestoreRevision]=useState('1');
 const [artifact,setArtifact]=useState('');
 const [artifactLabel,setArtifactLabel]=useState('View courtyard render');
 const [occtDoctor,setOcctDoctor]=useState<{ready:boolean;version?:string;reason?:string}|null>(null);
 const [solidDimensions,setSolidDimensions]=useState({width:'24',depth:'12',height:'6'});
 useEffect(()=>{let mounted=true;fetch('/api/cad/project/native/doctor')
  .then(async r=>{if(!r.ok)throw new Error('Native host unavailable');return r.json();})
  .then(v=>{if(mounted)setOcctDoctor(v);})
  .catch(()=>{if(mounted)setOcctDoctor({ready:false,reason:'Native host unavailable'});});
  return()=>{mounted=false;};},[]);
 const current=useRef(project),synced=useRef(''),adoptedId=useRef('');
 current.current=project;
 async function call(name:string,args:any){const res=await fetch('/api/cad/project/tools/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});const body=await res.json();if(!res.ok||!body.ok)throw new Error(body.error||'Project operation failed');return body.result;}
 function adopt(row:any){synced.current=JSON.stringify(row.project);adoptedId.current=row.project.id;setRevision(row.revision);onVerifiedRevision?.(row.revision,row.project.id);onLoad(row.project);}
 useEffect(()=>{let cancelled=false;setLoadId(project.id);setArtifact('');
  if(adoptedId.current===project.id)return;
  setRevision(0);onVerifiedRevision?.(null,project.id);synced.current='';
  call('design_project_get',{project_id:project.id}).then(row=>{
   if(cancelled)return;
   if(JSON.stringify(current.current)===JSON.stringify(row.project)){synced.current=JSON.stringify(row.project);setRevision(row.revision);onVerifiedRevision?.(row.revision,row.project.id);setStatus('Revision '+row.revision);}
   else setStatus('A saved project exists. Open saved before overwriting it.');
  }).catch(()=>{if(!cancelled)setStatus('Unsaved');});return()=>{cancelled=true;};
 },[project.id]);
 useEffect(()=>{const events=new EventSource('/api/cad/project/events');events.onmessage=e=>{
  const row=JSON.parse(e.data);if(row.project.id!==current.current.id)return;
  const next=JSON.stringify(row.project),local=JSON.stringify(current.current);
  if(local!==next&&local!==synced.current){setStatus('External revision '+row.revision+' available. Local edits retained; reopen to reconcile.');return;}
  synced.current=next;adoptedId.current=row.project.id;setRevision(row.revision);onVerifiedRevision?.(row.revision,row.project.id);onLoad(row.project);setStatus('Revision '+row.revision);
 };return()=>events.close();},[onLoad]);
 async function run(action:string){if(readOnly&&action!=='load')return;setBusy(true);setArtifact('');try{
  if(action==='load'){const r=await call('design_project_get',{project_id:loadId});adopt(r);setStatus('Loaded revision '+r.revision);}
  if(action==='save'||action==='render'){const r=await call('design_project_save',{project,expected_revision:revision});adopt(r);setStatus('Saved revision '+r.revision);
   if(action==='render'){const input={project_id:project.id,revision:r.revision};await call('design_model_build',input);await call('design_model_inspect',input);await call('design_model_export',{...input,format:'glb'});await call('design_model_render',input);setArtifact('/api/cad/project/artifact/'+project.id+'/'+r.revision+'/courtyard.png');setArtifactLabel('View courtyard render');setStatus('Built and rendered revision '+r.revision);}
  }
  if(action==='solid'){
   if(!occtDoctor?.ready)throw new Error(occtDoctor?.reason||'OCCT native kernel unavailable');
   const values=Object.values(solidDimensions).map(Number);
   if(values.some(v=>!Number.isFinite(v)||v<=0||v*25.4>1000000))throw new Error('Solid dimensions must be positive inches');
   const id='occt_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
   const primitive={id,name:'OCCT box',generator:'occt' as const,generatorTemplate:'box',
    parameters:{width:values[0],depth:values[1],height:values[2]},
    transform:{x:0,y:0,z:0},source:'occt:box',updatedAt:Date.now()};
   const updated={...project,parametricObjects:[...(project.parametricObjects||[]),primitive]};
   const saved=await call('design_project_save',{project:updated,expected_revision:revision});
   adopt(saved);
   const input={project_id:saved.project.id,revision:saved.revision};
   const build=await call('design_model_build',{...input,engine:'occt',parametric_object_id:id});
   await call('design_model_inspect',{...input,engine:'occt'});
   await call('design_model_export',{...input,format:'step'});
   setArtifact('/api/cad/project/artifact/'+saved.project.id+'/'+saved.revision+'/model.step');
   setArtifactLabel('Download verified STEP');
   setStatus('OCCT '+build.native_version+' STEP verified · revision '+saved.revision);
  }
  if(action==='restore'){const r=await call('design_project_restore',{project_id:project.id,revision:Number(restoreRevision),expected_revision:revision});adopt(r);setStatus('Restored as revision '+r.revision);}
 }catch(e:any){setStatus(e.message);}finally{setBusy(false);}}
 return <div className="relative z-40 flex min-h-9 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#111929] px-3 py-1.5 text-[11px] text-slate-200" data-cad-project-runtime>
  <div className="flex min-w-0 items-center gap-2">
    <span className="hidden font-semibold text-slate-400 sm:inline">Revision {revision || '—'}</span>
    <button type="button" disabled={busy||readOnly} onClick={()=>run('save')}
      className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 font-medium text-slate-100 hover:bg-white/20 disabled:opacity-40">Save revision</button>
    <span className="max-w-[min(34vw,370px)] truncate text-slate-400" role="status" title={status}>{busy?'Working…':status}</span>
  </div>
  <details className="group relative shrink-0">
    <summary className="list-none cursor-pointer rounded-md border border-white/15 px-2.5 py-1 text-slate-300 hover:bg-white/10">
      Project & native tools <span aria-hidden>⌄</span>
    </summary>
    <div className="absolute right-0 top-[calc(100%+7px)] z-[100] flex max-h-[min(70vh,640px)] w-[min(410px,calc(100vw-24px))] flex-col gap-3 overflow-y-auto rounded-xl border border-white/20 bg-[#182336] p-4 shadow-2xl" aria-label="Project storage and native tools">
      <div>
        <strong className="text-xs font-semibold">Project revisions</strong>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Local CAD host operations. Cloud revisions require the authenticated project service.</p>
      </div>
      <label className="flex flex-col gap-1 text-slate-300">Project ID
        <input aria-label="Project ID" className="min-h-9 rounded-md border border-white/20 bg-[#0f1727] px-2 text-slate-100" value={loadId} onChange={e=>setLoadId(e.target.value)} />
      </label>
      <button type="button" disabled={busy} onClick={()=>run('load')}
        className="min-h-9 rounded-md border border-white/20 bg-white/5 px-3 text-left hover:bg-white/10">Open saved revision</button>
      <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">Restore revision
          <input aria-label="Revision to restore" type="number" min="1" value={restoreRevision}
            className="min-h-9 rounded-md border border-white/20 bg-[#0f1727] px-2 text-slate-100" onChange={e=>setRestoreRevision(e.target.value)}/>
        </label>
        <button type="button" disabled={busy||readOnly||revision===0} onClick={()=>run('restore')}
          className="self-end rounded-md bg-white/10 px-3 py-2 hover:bg-white/20 disabled:opacity-40">Restore</button>
      </div>
      <button type="button" disabled={busy||readOnly} onClick={()=>run('render')}
        className="min-h-9 rounded-md border border-white/20 bg-white/5 px-3 text-left hover:bg-white/10">Build & render current project</button>
      <div className="border-t border-white/15 pt-3">
        <strong>Native OCCT solid tools</strong>
        <p className="mt-1 text-[11px] text-slate-400" title={occtDoctor?.reason||'Native host status'}>
          {occtDoctor===null?'Checking native host…':occtDoctor.ready?'OCCT '+occtDoctor.version:occtDoctor.reason||'OCCT unavailable'}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['width','depth','height'] as const).map(key=><label key={key} className="flex min-w-0 flex-col gap-1 capitalize">{key}
            <input aria-label={'OCCT box '+key+' in inches'} type="number" min="0.001" step="any"
              className="min-h-9 min-w-0 rounded-md border border-white/20 bg-[#0f1727] px-2 text-slate-100" value={solidDimensions[key]}
              onChange={e=>setSolidDimensions(old=>({...old,[key]:e.target.value}))}/></label>)}
        </div>
        <button type="button" disabled={busy||readOnly||!occtDoctor?.ready} onClick={()=>run('solid')}
          className="mt-3 w-full rounded-md bg-white/10 px-3 py-2 text-left hover:bg-white/20 disabled:opacity-40">Build verified OCCT solid (inches)</button>
      </div>
      {artifact&&<a href={artifact} target="_blank" rel="noreferrer" download={artifactLabel.startsWith('Download')?'model.step':undefined}
        className="rounded-md bg-sky-600/20 px-3 py-2 text-sky-200 underline">{artifactLabel}</a>}
    </div>
  </details>
 </div>;
}
