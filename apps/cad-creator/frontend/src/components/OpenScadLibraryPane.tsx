import {useCallback,useEffect,useMemo,useState} from 'react';
import snapshot from '../../../data/openscad-libraries-snapshot.json';
import {BookOpen,Check,Cloud,Download,Search,Settings2,Plus,RefreshCw,Save,X} from 'lucide-react';

export type ScadLibrary={
 slug:string;display_name:string;import_line:string;capability_tags:string[];
 license:string;commercial_safe:boolean;priority:number;repo_url:string|null;notes:string|null;
 active:boolean;updated_at:number;availability?:string;
};
type Draft={slug:string;display_name:string;import_line:string;capability_tags:string;license:string;repo_url:string;notes:string;commercial_safe:boolean;priority:number;active:boolean;expected_updated_at?:number};
export function insertOpenScadImport(source:string,importLine:string){
 const clean=importLine.trim();
 if(!/^(include|use) <[A-Za-z0-9_./-]+\.scad>$/.test(clean)||clean.includes('..'))throw Error('Invalid OpenSCAD library import.');
 if(source.split(/\r?\n/).some(line=>line.trim()===clean))return source;
 return clean+'\n'+(source.trim()?'\n'+source:'');
}
const fromSnapshot=():ScadLibrary[]=>(snapshot.libraries as Array<Record<string,unknown>>).map(raw=>({
 slug:String(raw.slug),display_name:String(raw.display_name),import_line:String(raw.import_line),
 capability_tags:JSON.parse(String(raw.capability_tags||'[]')) as string[],
 license:String(raw.license),commercial_safe:raw.commercial_safe===1,priority:Number(raw.priority),
 repo_url:raw.repo_url?String(raw.repo_url):null,notes:raw.notes?String(raw.notes):null,
 active:raw.active===1,updated_at:Number(raw.updated_at),availability:'registered-only',
}));
const empty=():Draft=>({slug:'',display_name:'',import_line:'',capability_tags:'',license:'MIT',
 repo_url:'',notes:'',commercial_safe:true,priority:5,active:true});
const edit=(row:ScadLibrary):Draft=>({
 slug:row.slug,display_name:row.display_name,import_line:row.import_line,
 capability_tags:row.capability_tags.join(', '),license:row.license,repo_url:row.repo_url||'',
 notes:row.notes||'',commercial_safe:row.commercial_safe,priority:row.priority,active:row.active,
 expected_updated_at:row.updated_at,
});
const CATALOG='/api/agentsam/openscad-libraries';
export function OpenScadLibraryPane({onInsert,disabled,compact=false}:{onInsert:(line:string)=>void;disabled:boolean;compact?:boolean}){
 const [rows,setRows]=useState<ScadLibrary[]>(fromSnapshot);
 const [live,setLive]=useState(false),[canManage,setCanManage]=useState(false);
 const [query,setQuery]=useState(''),[safeOnly,setSafeOnly]=useState(false),[onlyActive,setOnlyActive]=useState(true);
 const [selected,setSelected]=useState<string|null>(null),[editDraft,setEditDraft]=useState<Draft|null>(null);
 const [probe,setProbe]=useState<Record<string,boolean>|null>(null);
 const [notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const reload=useCallback(async()=>{
  try{
   const res=await fetch(CATALOG,{credentials:'same-origin',headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('Live catalog unavailable (HTTP '+res.status+')');
   const data=await res.json();
   if(data.source!=='cloudflare-d1'||!Array.isArray(data.libraries))throw Error('Unexpected catalog response.');
   setRows(data.libraries as ScadLibrary[]);setCanManage(data.canManage===true);setLive(true);
   setNotice('');
  }catch{
   setRows(fromSnapshot());setLive(false);setCanManage(false);
   setNotice('Using the dated local D1 snapshot. Live editing is unavailable on this host.');
  }
 },[]);
 useEffect(()=>{void reload()},[reload]);
 useEffect(()=>{
  const controller=new AbortController();
  setProbe(null);
  fetch('/api/cad/openscad/libraries/probe',{method:'POST',credentials:'same-origin',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({imports:rows.map(r=>r.import_line)}),signal:controller.signal})
   .then(res=>{if(!res.ok)throw Error('Local native runtime unavailable');return res.json()})
   .then(data=>{if(data.ok&&Array.isArray(data.results))setProbe(Object.fromEntries(data.results.map(
    (row:{import_line:string;sourcePresent:boolean})=>[row.import_line,row.sourcePresent])))})
   .catch(()=>{});
  return ()=>controller.abort();
 },[rows]);
 const filtered=useMemo(()=>rows.filter(row=>(!onlyActive||row.active)&&(!safeOnly||row.commercial_safe)&&
  (!query||[row.slug,row.display_name,row.license,row.notes||'',...row.capability_tags]
   .join(' ').toLowerCase().includes(query.toLowerCase()))),[rows,onlyActive,safeOnly,query]);
 const chosen=rows.find(row=>row.slug===selected)||null;
 const save=async()=>{
  if(!editDraft||!live||!canManage||busy)return;
  setBusy(true);setNotice('');
  const isNew=!editDraft.expected_updated_at;
  try{
   const data={
    slug:editDraft.slug,display_name:editDraft.display_name,import_line:editDraft.import_line,
    capability_tags:editDraft.capability_tags.split(',').map(s=>s.trim()).filter(Boolean),
    license:editDraft.license,repo_url:editDraft.repo_url||null,notes:editDraft.notes||null,
    commercial_safe:editDraft.commercial_safe?1:0,priority:Number(editDraft.priority),
    active:editDraft.active?1:0,expected_updated_at:editDraft.expected_updated_at,
   };
   const res=await fetch(isNew?CATALOG:CATALOG+'/'+encodeURIComponent(editDraft.slug),{
    method:isNew?'POST':'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),
   });
   const response=await res.json();
   if(!res.ok)throw Error(response.error||'Catalog write rejected');
   setEditDraft(null);setSelected(response.library.slug);await reload();setNotice('Saved to the live D1 library registry.');
  }catch(e){setNotice(e instanceof Error?e.message:String(e))}
  finally{setBusy(false)}
 };
 const retire=async()=>{
  if(!chosen||!canManage||!live||busy||!window.confirm('Deactivate this library in the shared D1 catalog?'))return;
  setBusy(true);
  try{
   const res=await fetch(CATALOG+'/'+encodeURIComponent(chosen.slug),{method:'DELETE',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_updated_at:chosen.updated_at})});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Deactivate failed');
   setSelected(null);await reload();setNotice('Library deactivated in D1.');
  }catch(e){setNotice(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 };
 return <aside className={compact?'cad-scad-library-embedded min-h-0 border rounded-lg flex flex-col':'w-full lg:w-80 min-h-0 shrink-0 border border-slate-700 rounded-lg flex flex-col bg-slate-900/80'} aria-label="OpenSCAD libraries">
  <header className="p-3 border-b border-slate-700 space-y-2">
   <div className="flex justify-between items-center gap-2">
    <span className="font-semibold text-sm flex items-center gap-2"><BookOpen size={16}/> OpenSCAD libraries</span>
    <div className="flex items-center gap-1">
     {canManage&&live&&<button type="button" className="rounded p-1.5 hover:bg-slate-700" title="Add library" onClick={()=>setEditDraft(empty())}><Plus size={16}/></button>}
     <button type="button" className="rounded p-1.5 hover:bg-slate-700" title="Refresh D1 registry" onClick={()=>void reload()}><RefreshCw size={15}/></button>
    </div>
   </div>
   <div className="flex items-center gap-1 text-xs text-slate-400">
    {live?<><Cloud size={12}/> Live D1</>:<><Download size={12}/> D1 snapshot · Oct 28</>}
    <span className="ml-auto">{rows.length} records</span>
   </div>
   <label className="flex items-center bg-slate-950 border border-slate-700 rounded px-2 gap-2">
    <Search size={14}/><input className="bg-transparent py-2 text-xs w-full outline-none" aria-label="Search OpenSCAD libraries"
      placeholder="Search tools, threads, shapes…" value={query} onChange={e=>setQuery(e.target.value)}/>
   </label>
   <div className="flex flex-wrap gap-3 text-xs text-slate-400">
    <label><input type="checkbox" checked={onlyActive} onChange={e=>setOnlyActive(e.target.checked)}/> Active</label>
    <label><input type="checkbox" checked={safeOnly} onChange={e=>setSafeOnly(e.target.checked)}/> Commercial flag</label>
   </div>
  </header>
  {notice&&<div role="status" className="px-3 py-2 text-xs text-amber-300 border-b border-slate-700">{notice}</div>}
  {editDraft&&canManage&&live?<div className="overflow-auto p-3 space-y-2 text-xs">
   <div className="flex justify-between items-center"><strong>{editDraft.expected_updated_at?'Edit library':'Register library'}</strong><button onClick={()=>setEditDraft(null)} title="Cancel"><X size={16}/></button></div>
   {(['slug','display_name','import_line','capability_tags','license','repo_url','notes'] as const).map(field=>
    <label key={field} className="block text-slate-400">{field.replaceAll('_',' ')}
     <input className="mt-1 block w-full rounded bg-slate-950 p-2 text-slate-200 border border-slate-700" value={editDraft[field]}
      disabled={field==='slug'&&!!editDraft.expected_updated_at} onChange={e=>setEditDraft({...editDraft,[field]:e.target.value})}/>
    </label>)}
   <label className="block">Priority <input type="number" min="1" max="99" className="w-20 bg-slate-950 p-1 border border-slate-700 rounded"
    value={editDraft.priority} onChange={e=>setEditDraft({...editDraft,priority:Number(e.target.value)})}/></label>
   <label className="block"><input type="checkbox" checked={editDraft.commercial_safe}
    onChange={e=>setEditDraft({...editDraft,commercial_safe:e.target.checked})}/> Commercial metadata flag</label>
   <label className="block"><input type="checkbox" checked={editDraft.active}
    onChange={e=>setEditDraft({...editDraft,active:e.target.checked})}/> Active</label>
   <button disabled={busy} className="w-full bg-purple-700 rounded p-2 font-semibold disabled:opacity-50" onClick={()=>void save()}><Save size={14} className="inline"/> Save to D1</button>
  </div>:<>
   <div className="min-h-24 max-h-52 overflow-y-auto p-2 space-y-1">
    {filtered.map(row=><button type="button" key={row.slug} onClick={()=>setSelected(row.slug)}
      className={'w-full rounded p-2 text-left border text-xs '+(selected===row.slug?'bg-purple-900/40 border-purple-600':'border-slate-800 hover:bg-slate-800')}>
      <div className="flex justify-between items-center gap-2"><strong className="truncate">{row.display_name}</strong>
       <span className="text-slate-400">{row.license}</span></div>
      <div className="text-slate-400 mt-1 line-clamp-1">{row.capability_tags.slice(0,4).join(' · ')}</div>
     </button>)}
    {!filtered.length&&<p className="p-2 text-xs text-slate-400">No matching libraries.</p>}
   </div>
   {chosen&&<div className="border-t border-slate-700 p-3 space-y-2 text-xs overflow-y-auto">
    <strong className="text-sm">{chosen.display_name}</strong>
    <p className="text-slate-400">{chosen.notes||'Registered OpenSCAD utility library.'}</p>
    <code className="block bg-slate-950 rounded p-2 break-all text-sky-300">{chosen.import_line}</code>
    <div className="flex gap-2 flex-wrap">
     <span className={probe===null?'text-slate-400':probe[chosen.import_line]?'text-emerald-400':'text-amber-300'}>
      {probe===null?'Local install not checked':probe[chosen.import_line]?'Source found locally':'Source not found in known roots'}
     </span>
     <span className="text-slate-400">· {chosen.license}</span>
    </div>
    <p className="text-slate-500">License/commercial flags are registry metadata; validate the license for your intended use.</p>
    <div className="flex flex-wrap gap-2">
     <button disabled={disabled} className="rounded bg-purple-700 px-3 py-2 font-medium disabled:opacity-40"
      onClick={()=>onInsert(chosen.import_line)}>Insert import</button>
     {canManage&&live&&<button onClick={()=>setEditDraft(edit(chosen))} className="rounded border border-slate-600 px-2 py-2"><Settings2 size={13} className="inline"/> Edit</button>}
     {canManage&&live&&<button onClick={()=>void retire()} disabled={busy} className="rounded border border-rose-800 text-rose-300 px-2 py-2">Deactivate</button>}
    </div>
    {chosen.repo_url&&<a className="text-sky-400 underline block break-all" href={chosen.repo_url} target="_blank" rel="noopener noreferrer">Repository documentation</a>}
   </div>}
  </>}
  <footer className="mt-auto border-t border-slate-700 p-2 text-xs text-slate-500">Registered is not installed. Imports require a matching local OpenSCAD library file.</footer>
 </aside>;
}
