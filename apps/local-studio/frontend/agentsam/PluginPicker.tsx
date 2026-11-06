import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Bot, Box, Database, FileCode, Film, Globe, Layers, Plug, Plus, ShieldCheck, Sparkles, SquareTerminal, Target, Upload, Users, Wrench, X } from 'lucide-react';
import { filterComposerCatalog, projectComposerCatalog, type ComposerCatalogEntry } from '@inneranimalmedia/agentsam-workbench/capabilities';
import { loadComposerCatalog } from './plugins';
import { sideStageComposerWidgets, sideStageRegistrySnapshot } from './side-stage-actions';
import { useWorkStore } from '@/lib/work/store';
import { SETTINGS_CATALOG_CHANGED_EVENT } from '@/lib/desktop/connection-deep-link';

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
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener(SETTINGS_CATALOG_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_CATALOG_CHANGED_EVENT, refresh);
  }, []);
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
      const stage = sideStageRegistrySnapshot().actions.find(item => entry.id === 'widget:' + item.id);
      // An @ reference cannot manufacture a stage that the authenticated
      // runtime catalog has not actually registered.
      if (!stage) { setOpen(false); return; }
      useWorkStore.getState().openSideTab(
        stage.tabKind as Parameters<ReturnType<typeof useWorkStore.getState>['openSideTab']>[0],
        { title: stage.label, pluginId: stage.pluginId, stageId: stage.stageId,
          parentChatId: stage.tabKind==='goal' ? useWorkStore.getState().activeChatId : null,
          ephemeral:false },
      );
      replaceMention(entry,false);
    } else if(entry.action.type==='setup'||!entry.ready){
      window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: '/settings/integrations' } }));
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
    globe:Globe,browser:Globe,files:FileCode,'file-code':FileCode,
    artifacts:Box,box:Box,ship:Upload,cad:Layers,layers:Layers,layout:Layers,
    database:Database,cli:SquareTerminal,'square-terminal':SquareTerminal,
    coworker:Users,users:Users,target:Target,film:Film,plug:Plug,
  };
  function rowIcon(entry:ComposerCatalogEntry){
    if(entry.iconUrl)return <span className="agentsam-plugin-icon">
      <img className="plugin-icon-light" src={entry.iconUrl} alt="" />
      <img className="plugin-icon-dark" src={entry.iconDarkUrl||entry.iconUrl} alt="" />
    </span>;
    const Component=(icons as Record<string,typeof Plug>)[entry.icon||'']||
      (icons as Record<string,typeof Plug>)[entry.id.split(':').pop()||'']||
      (entry.kind==='connection'?ShieldCheck:entry.kind==='mcp'?Wrench:entry.kind==='agent'?Bot:entry.kind==='skill'?Sparkles:Plug);
    return <Component size={17} aria-hidden="true" />;
  }

  return <div className="agentsam-plugin-host" ref={root}>
    {children({
      trigger:<button type="button" className="as-nav-button" aria-label="Add tools and plugins" title="Add tools and plugins" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
        onClick={()=>{setOpen(!open);setActive(0);setRevision(n=>n+1);}}><Plus size={19}/></button>,
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
    {open&&<div className="agentsam-plugin-menu" id={id} role="dialog" aria-label="Add to your message">
      <div className="agentsam-plugin-heading">
        <strong>Add to your message</strong><span>Plugins, connections, apps and tools · type @ to filter</span>
        <button type="button" className="as-nav-button" aria-label="Close capabilities" onClick={()=>setOpen(false)}><X size={16}/></button>
      </div>
      {error&&<p role="status" className="agentsam-plugin-notice">Some connected services couldn't be loaded. Available tools are still shown.</p>}
      {loading&&<p role="status" className="agentsam-plugin-notice">Loading your plugins and tools…</p>}
      {!shown.length&&!loading&&<p className="agentsam-plugin-notice">No matching capabilities.</p>}
      {shown.map((entry,index)=><button type="button" key={entry.id}
        className="agentsam-plugin-row" data-active={index===active}
        onClick={()=>choose(entry)}>
        {rowIcon(entry)}
        <span className="min-w-0 flex-1"><strong>{entry.label}</strong><small>{entry.description||entry.status}</small></span>
        <small>{entry.ready?entry.mention:'Set up'}</small>
      </button>)}
    </div>}

  </div>;
}
