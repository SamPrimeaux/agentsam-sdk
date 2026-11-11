import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, RotateCcw, Save } from 'lucide-react';

type Entry = { key:string; section:string; depth:number; id:string; label:string; href:string; icon:string };
type Override = { label?:string; href?:string; icon?:string; hidden?:boolean; order?:number };
type Result = { ok:boolean; entries:Entry[]; overrides:Record<string,Override>; revision:number; iconChoices:string[]; error?:string };
const sections: Record<string,string> = {
  primary:'Primary navigation', channels:'Sales channels', apps:'Installed applications', utilities:'Utilities',
};
function siblings(entry:Entry, entries:Entry[]) {
  const parent = entry.key.slice(0,entry.key.lastIndexOf('/'));
  return entries.filter(item=>item.key.slice(0,item.key.lastIndexOf('/'))===parent);
}

/** Runtime navigation presentation; never register routes or install applications here. */
export function PlatformNavigationSettings() {
  const [data,setData] = useState<Result|null>(null);
  const [edits,setEdits] = useState<Record<string,Override>>({});
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');

  const load = async (signal?:AbortSignal) => {
    try {
      const response = await fetch('/api/studio/navigation',{credentials:'same-origin',signal});
      const result: Result = await response.json();
      if (!response.ok || !result.ok || !Array.isArray(result.entries)) throw new Error(result.error || 'Navigation configuration unavailable');
      if (signal?.aborted) return;
      setData(result);setEdits(result.overrides || {});setDirty(false);setError('');
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error?cause.message:'Navigation configuration unavailable');
    } finally {if(!signal?.aborted)setLoading(false);}
  };
  useEffect(()=>{
    const controller = new AbortController();
    void load(controller.signal);
    return ()=>controller.abort();
  },[]);
  const rowMap=useMemo(()=>new Map((data?.entries || []).map(item=>[item.key,item])),[data?.entries]);
  const patch=(key:string,change:Partial<Override>)=>{
    setEdits(current=>({...current,[key]:{...(current[key]||{}),...change}}));
    setDirty(true);setNotice('');
  };
  const ordered=useMemo(()=>{
    const list=[...(data?.entries || [])];
    const original=new Map(list.map((entry,index)=>[entry.key,index]));
    return list.sort((a,b)=>{
      if(a.section!==b.section)return ['primary','channels','apps','utilities'].indexOf(a.section)-['primary','channels','apps','utilities'].indexOf(b.section);
      const ap=a.key.slice(0,a.key.lastIndexOf('/')),bp=b.key.slice(0,b.key.lastIndexOf('/'));
      if(ap!==bp)return (original.get(a.key)||0)-(original.get(b.key)||0);
      return (edits[a.key]?.order??original.get(a.key)??0)-(edits[b.key]?.order??original.get(b.key)??0);
    });
  },[data?.entries,edits]);
  const move=(entry:Entry,delta:number)=>{
    const group=siblings(entry,ordered);
    const current=group.findIndex(item=>item.key===entry.key), next=current+delta;
    if(next<0||next>=group.length)return;
    const swapped=[...group];
    [swapped[current],swapped[next]]=[swapped[next],swapped[current]];
    setEdits(prev=>{
      const update={...prev};
      swapped.forEach((item,index)=>{update[item.key]={...(prev[item.key]||{}),order:index};});
      return update;
    });
    setDirty(true);setNotice('');
  };
  const save=async()=>{
    if(!data||saving||!dirty)return;
    setSaving(true);setError('');setNotice('');
    try{
      const response=await fetch('/api/studio/navigation',{
        method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json'},
        body:JSON.stringify({overrides:edits,expectedRevision:data.revision}),
      });
      const result:Result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error==='navigation_stale_revision'?'These settings changed elsewhere. Refresh before saving.':result.error||'Could not save navigation');
      setData(result);setEdits(result.overrides);setDirty(false);setNotice('Saved. Navigation updated.');
      window.dispatchEvent(new Event('agentsam:navigation-changed'));
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not save navigation');}
    finally{setSaving(false);}
  };
  if(loading)return <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">Loading navigation settings…</div>;
  if(!data)return <div role="alert" className="rounded-xl border border-border p-6 text-sm text-destructive">Navigation settings are unavailable: {error}. No changes were applied.</div>;
  return <section className="space-y-4" aria-label="Platform navigation settings">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Admin navigation</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Edit labels, icons, link targets and order without rebuilding the shell. Only installed destinations are shown; changing a link does not create a route or grant access.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted" onClick={()=>{setEdits({});setDirty(true);setNotice('Defaults selected. Save to apply.');}}><RotateCcw size={14} className="mr-1 inline"/>Reset</button>
        <button type="button" disabled={!dirty||saving} className="rounded-md border border-border bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={()=>void save()}><Save size={14} className="mr-1 inline"/>{saving?'Saving…':'Save navigation'}</button>
      </div>
    </div>
    {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {Object.entries(sections).map(([section,title])=>{
      const rows=ordered.filter(item=>item.section===section);
      if(!rows.length)return null;
      return <div key={section} className="rounded-xl border border-border">
        <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h3>
        <div className="divide-y divide-border">
          {rows.map(entry=>{
            const change=edits[entry.key]||{};
            const group=siblings(entry,ordered);
            const index=group.findIndex(item=>item.key===entry.key);
            return <div key={entry.key} className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(120px,1fr)_minmax(120px,.7fr)_minmax(170px,1fr)_auto_auto] lg:items-center" style={{paddingLeft:16+Math.min(entry.depth,3)*12}}>
              <label className="grid gap-1 text-xs text-muted-foreground">Label
                <input aria-label={entry.label+' label'} className="min-w-0 rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground" maxLength={80} value={change.label??entry.label} onChange={event=>patch(entry.key,{label:event.target.value})}/>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Icon
                <select aria-label={entry.label+' icon'} className="min-w-0 rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground" value={change.icon??entry.icon} onChange={event=>patch(entry.key,{icon:event.target.value})}>
                  {!data.iconChoices.includes(change.icon??entry.icon)&&<option value={change.icon??entry.icon}>{change.icon??entry.icon}</option>}
                  {data.iconChoices.map(icon=><option key={icon} value={icon}>{icon}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">Route
                <input aria-label={entry.label+' route'} className="min-w-0 rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground" value={change.href??entry.href} onChange={event=>patch(entry.key,{href:event.target.value})}/>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={change.hidden??false} onChange={event=>patch(entry.key,{hidden:event.target.checked})}/>
                Hidden
              </label>
              <div className="flex items-center gap-1">
                <button type="button" disabled={index<=0} className="rounded-md border border-border p-2 disabled:opacity-30" aria-label={'Move '+entry.label+' up'} onClick={()=>move(entry,-1)}><ArrowUp size={14}/></button>
                <button type="button" disabled={index>=group.length-1} className="rounded-md border border-border p-2 disabled:opacity-30" aria-label={'Move '+entry.label+' down'} onClick={()=>move(entry,1)}><ArrowDown size={14}/></button>
              </div>
            </div>;
          })}
        </div>
      </div>;
    })}
  </section>;
}
