import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Bot, Box, Database, FileCode, Globe, Layers, Plus, Plug, ShieldCheck, Sparkles, SquareTerminal, Upload, Users, Wrench, X } from 'lucide-react';
import { COMPOSER_GROUPS, filterComposerCatalog, projectComposerCatalog, type ComposerCatalogEntry } from '@inneranimalmedia/agentsam-workbench/agent';
import { loadComposerCatalog } from './plugins';
import { sideStageComposerWidgets } from './side-stage-actions';
import { useWorkStore } from '@/lib/work/store';

/** A single compact capability/context picker for both + and typed @. */
export function PluginPicker({ value, onChange, children }: {
  value: string;
  onChange: (value: string) => void;
  children: (controls: {
    trigger: ReactNode;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onSelect: (position: number) => void;
  }) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  // Real mounted SideStage tabs are usable even while OAuth discovery loads.
  const [entries,setEntries] = useState<ComposerCatalogEntry[]>(() =>
    projectComposerCatalog({widgets:sideStageComposerWidgets()}));
  const [error,setError] = useState('');
  const [loading,setLoading] = useState(false);
  const [open,setOpen] = useState(false);
  const [cursor,setCursor] = useState(value.length);
  const [active,setActive] = useState(0);
  const [revision,setRevision] = useState(0);
  const match=value.slice(0,cursor).match(/(?:^|\s)@([\w-]*)$/);
  const filtered=filterComposerCatalog(entries,match?.[1]||'');
  const shown=filtered.slice(0,60);

  useEffect(() => {
    let cancelled=false;
    setLoading(true); setError('');
    loadComposerCatalog().then(items => {
      if(!cancelled) setEntries(items);
    }).catch((e:Error)=>{
      if(!cancelled) {
        // Do not fabricate connections when OAuth/MCP discovery fails.
        setEntries(projectComposerCatalog({widgets:sideStageComposerWidgets()}));
        setError(e.message||'Connections unavailable');
      }
    }).finally(()=>{ if(!cancelled)setLoading(false); });
    return ()=>{cancelled=true;};
  },[revision]);
  useEffect(() => {
    const close=(event:PointerEvent)=>{
      if(!root.current?.contains(event.target as Node))setOpen(false);
    };
    document.addEventListener('pointerdown',close);
    return ()=>document.removeEventListener('pointerdown',close);
  },[]);

  function replaceMention(entry:ComposerCatalogEntry, insert:boolean) {
    if(!match)return;
    const start=cursor-match[1].length-1;
    const end=cursor;
    const left=value.slice(0,start);
    const right=value.slice(end);
    const replacement=insert ? (left&&!/\s$/.test(left)?' ':'')+entry.mention+' ' : '';
    const updated=left+replacement+right;
    onChange(updated);
    requestAnimationFrame(()=>{
      const textarea=root.current?.querySelector('textarea');
      textarea?.focus();
      textarea?.setSelectionRange(left.length+replacement.length,left.length+replacement.length);
    });
  }
  function choose(entry:ComposerCatalogEntry){
    if(entry.action.type==='open-side-stage'&&entry.ready){
      useWorkStore.getState().openSideTab(entry.action.tab as Parameters<ReturnType<typeof useWorkStore.getState>['openSideTab']>[0],
        entry.action.tab==='goal' ? { title:'Edit goal',parentTrailId:useWorkStore.getState().activeTrailId,ephemeral:false }
          : entry.action.tab==='chat' ? undefined : {ephemeral:false});
      replaceMention(entry,false);
    } else if(entry.action.type==='setup'||!entry.ready){
      useWorkStore.getState().setSettingsOpen(true);
      replaceMention(entry,false);
    } else {
      const start=match?cursor-match[1].length-1:value.length;
      const end=match?cursor:value.length;
      const left=value.slice(0,start);
      const right=value.slice(end);
      const replacement=(left&&!/\s$/.test(left)?' ':'')+entry.mention+' ';
      const updated=left+replacement+right;
      onChange(updated);
      requestAnimationFrame(()=>{
        const textarea=root.current?.querySelector('textarea');
        textarea?.focus();
        textarea?.setSelectionRange(left.length+replacement.length,left.length+replacement.length);
      });
    }
    setOpen(false);
  }
  function onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>) {
    if(!open)return;
    if(event.key==='Escape'){
      event.preventDefault();event.stopPropagation();setOpen(false);
    } else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      setActive(index=>Math.max(0,Math.min(shown.length-1,index+(event.key==='ArrowDown'?1:-1))));
    } else if(event.key==='Enter'&&shown[active]){
      event.preventDefault();event.stopPropagation();choose(shown[active]);
    }
  }
  const icons={
    browser:Globe,files:FileCode,artifacts:Box,ship:Upload,cad:Layers,
    database:Database,cli:SquareTerminal,coworker:Users,
  };
  function rowIcon(entry:ComposerCatalogEntry){
    if(entry.iconUrl)return <span className="agentsam-plugin-icon">
      <img className="plugin-icon-light" src={entry.iconUrl} alt="" />
      <img className="plugin-icon-dark" src={entry.iconDarkUrl||entry.iconUrl} alt="" />
    </span>;
    const Component=(icons as Record<string,typeof Plug>)[entry.id.split(':').pop()||'']||
      (entry.kind==='connection'?ShieldCheck:entry.kind==='mcp'?Wrench:entry.kind==='agent'?Bot:entry.kind==='skill'?Sparkles:Plug);
    return <Component size={17} aria-hidden="true" />;
  }

  return <div className="agentsam-plugin-host" ref={root}>
    {children({
      trigger:<button type="button" className="as-nav-button" aria-label="Add capability" aria-expanded={open} aria-controls={id}
        onClick={()=>{setOpen(!open);setActive(0);setRevision(n=>n+1);}}><Plus size={16}/></button>,
      onKeyDown,
      onSelect:(position)=>{
        setCursor(position);
        setActive(0);
        const textarea=root.current?.querySelector('textarea');
        const typingMention=Boolean(textarea?.value.slice(0,position).match(/(?:^|\s)@([\w-]*)$/));
        if(typingMention&&!open)setRevision(n=>n+1);
        setOpen(typingMention);
      },
    })}
    {open&&<div className="agentsam-plugin-menu" id={id} role="dialog" aria-label="AgentSam capabilities">
      <div className="agentsam-plugin-heading">
        <strong>AgentSam</strong><span>Type @ to add a capability</span>
        <button type="button" className="as-nav-button" aria-label="Close capabilities" onClick={()=>setOpen(false)}><X size={16}/></button>
      </div>
      {error&&<p role="status" className="text-xs text-muted-foreground">Connected services unavailable: {error}</p>}
      {loading&&<p role="status" className="text-xs text-muted-foreground">Checking connected capabilities…</p>}
      {!shown.length&&!loading&&<p className="text-xs text-muted-foreground">No matching capabilities.</p>}
      {COMPOSER_GROUPS.map(group=>{
        const items=shown.filter(entry=>entry.kind===group.kind);
        return items.length?<div key={group.kind} className="agentsam-capability-group">
          <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">{group.label}</div>
          {items.map(entry=><button type="button" key={entry.id}
            className="agentsam-plugin-row" data-active={shown.indexOf(entry)===active}
            onClick={()=>choose(entry)}>
            {rowIcon(entry)}
            <span className="min-w-0 flex-1"><strong>{entry.label}</strong><small>{entry.description||entry.status}</small></span>
            <small>{entry.ready?entry.mention:'Set up'}</small>
          </button>)}
        </div>:null;
      })}
    </div>}
    {entries.some(entry=>entry.ready&&(entry.kind==='connection'||entry.kind==='mcp'))&&
      <div className="agentsam-plugin-previews" aria-label="Connected capabilities">
        {entries.filter(entry=>entry.ready&&(entry.kind==='connection'||entry.kind==='mcp')).slice(0,4)
          .map(entry=><button type="button" key={entry.id} title={entry.label}
            onClick={()=>{setOpen(true);setActive(0);setRevision(n=>n+1);}}>
            {rowIcon(entry)}{entry.mention}
          </button>)}
      </div>}
  </div>;
}
