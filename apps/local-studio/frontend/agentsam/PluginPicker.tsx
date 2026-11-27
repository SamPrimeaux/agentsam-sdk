import { IconAction } from "@/components/ui/icon-action";
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Bot, Box, Check, Database, FileCode, Film, Folder, Globe, ImagePlus, Layers, Plug, Plus, Search, ShieldCheck, Sparkles, SquareTerminal, Target, Upload, Users, Wrench, X } from 'lucide-react';
import type { AgentRunMode } from '@inneranimalmedia/agentsam-contracts';
import { filterComposerCatalog, projectComposerCatalog, type ComposerCatalogEntry } from '@inneranimalmedia/agentsam-workbench/capabilities';
import { loadComposerCatalog } from './plugins';
import { sideStageComposerWidgets, sideStageRegistrySnapshot } from './side-stage-actions';
import { useWorkStore } from '@/lib/work/store';
import { openBrowserSideStage } from '@/lib/work/open-browser-side-stage';
import { SETTINGS_CATALOG_CHANGED_EVENT } from '@/lib/desktop/connection-deep-link';
import { resolveComposerPopoverLayout } from './composer-popover-layout';

/** A single compact capability/context picker for both + and typed @. */
function PlusMenuRow({ icon, title, hint, onClick, meta, desktopOnly = false }: { icon: ReactNode; title: string; hint: string; onClick: () => void; meta?: string; desktopOnly?: boolean }) {
  return <button type="button" className="agentsam-plugin-row agentsam-plugin-row--compact" data-desktop-only={desktopOnly || undefined} onClick={onClick}>
    <span className="agentsam-plus-action-icon">{icon}</span>
    <span className="agentsam-plugin-row-copy"><strong>{title}</strong><small>{hint}</small></span>
    {meta ? <small className="agentsam-plugin-row-meta">{meta}</small> : null}
  </button>;
}

export function PluginPicker({ targetChatId, value, onChange, onAttach, onLibrary, onImage, onWebSearch, onProject, activeMode, onModeChange, contextLabel, children }: {
  targetChatId?: string;
  value: string;
  onChange: (value: string) => void;
  onAttach?: () => void;
  onLibrary?: () => void;
  onImage?: () => void;
  onWebSearch?: () => void;
  onProject?: () => void;
  activeMode?: AgentRunMode;
  onModeChange?: (mode: AgentRunMode) => void;
  contextLabel?: string;
  children: (controls: {
    trigger: ReactNode;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
    onSelect: (position: number) => void;
    openPlugins: () => void;
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
  const [section,setSection] = useState<'root'|'mention'|'skills'|'modes'|'browser-tabs'>('root');
  const [placement,setPlacement] = useState<'above'|'below'>('above');
  const [menuMaxHeight,setMenuMaxHeight] = useState(0);
  const [browserTabs,setBrowserTabs] = useState<Array<{id:string;title:string;url:string}>>([]);
  const [query,setQuery] = useState('');
  const [mentionFromComposer,setMentionFromComposer] = useState(false);
  const [skills,setSkills] = useState<Array<{id:string;name:string;trigger:string;description?:string}>>([]);
  const [skillsError,setSkillsError] = useState('');
  const [skillsLoading,setSkillsLoading] = useState(false);
  useEffect(() => {
    const openForChat = (event: Event) => {
      if (!targetChatId || (event as CustomEvent).detail?.chatId !== targetChatId) return;
      setOpen(true); setMentionFromComposer(false); setSection('mention'); setQuery(''); setActive(0); setRevision(n=>n+1);
    };
    window.addEventListener('agentsam:conversation-plugins', openForChat);
    return () => window.removeEventListener('agentsam:conversation-plugins', openForChat);
  }, [targetChatId]);
  useEffect(() => {
    if (!open || section !== 'skills') return;
    const controller = new AbortController();
    setSkillsLoading(true); setSkillsError('');
    fetch('/api/settings/skills', {credentials:'same-origin',signal:controller.signal})
      .then(async response => {if(!response.ok)throw new Error('Your skills could not be loaded.'); return response.json();})
      .then(data => { if(!Array.isArray(data.skills))throw new Error('Your skills could not be loaded.'); setSkills(data.skills); })
      .catch(error => {if(!controller.signal.aborted)setSkillsError(error.message);})
      .finally(() => {if(!controller.signal.aborted)setSkillsLoading(false);});
    return () => controller.abort();
  }, [open,section,revision]);
  const match=mentionFromComposer ? value.slice(0,cursor).match(/(?:^|\s)@([\w-]*)$/) : null;
  const filtered=filterComposerCatalog(entries,match ? match[1] : query);
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
  useEffect(() => {
    if (!open) return;
    const updatePlacement = () => {
      const rect = root.current?.getBoundingClientRect();
      if (!rect) return;
      const visual = window.visualViewport;
      const { placement: nextPlacement, maxHeight } = resolveComposerPopoverLayout({
        anchorTop: rect.top,
        anchorBottom: rect.bottom,
        visibleTop: visual?.offsetTop ?? 0,
        visibleBottom: visual ? visual.offsetTop + visual.height : window.innerHeight,
      });
      setPlacement(nextPlacement);
      setMenuMaxHeight(maxHeight);
    };
    updatePlacement();
    const frame = requestAnimationFrame(updatePlacement);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePlacement) : null;
    if (root.current) observer?.observe(root.current);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    window.visualViewport?.addEventListener('resize', updatePlacement);
    window.visualViewport?.addEventListener('scroll', updatePlacement);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
      window.visualViewport?.removeEventListener('resize', updatePlacement);
      window.visualViewport?.removeEventListener('scroll', updatePlacement);
    };
  }, [open, section]);

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
      const work = useWorkStore.getState();
      const kind = stage.tabKind as Parameters<typeof work.openSideTab>[0];
      const existing = work.sideTabs.find(item => item.kind === kind);
      work.openSideTab(kind, {
        title: stage.label,
        pluginId: stage.renderer === "builtin" ? undefined : stage.pluginId,
        stageId: stage.renderer === "builtin" ? undefined : stage.stageId,
        ...(kind === "design" && !existing ? { url: "/canvas?library=sources" } : {}),
        parentChatId: kind === "goal" ? work.activeChatId : null,
        ephemeral: false,
      });
      replaceMention(entry,false);
    } else if(entry.action.type==='open-side-stage'){
      window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: '/admin/settings/customize?view=apps' } }));
      replaceMention(entry,false);
    } else if(entry.action.type==='setup'||!entry.ready){
      window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: '/admin/settings/integrations' } }));
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
  function safeBrowserTabUrl(raw: string): string | null {
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) {
        if (/(token|secret|password|session|auth|api[_-]?key|^code$)/i.test(key)) url.searchParams.delete(key);
      }
      return url.toString();
    } catch { return null; }
  }
  function openBrowserTabPicker() {
    const tabs = useWorkStore.getState().sideTabs
      .filter(tab => tab.kind === 'browser')
      .map(tab => ({ id: tab.id, title: tab.title || tab.url, url: safeBrowserTabUrl(tab.url) }))
      .filter((tab): tab is {id:string;title:string;url:string} => Boolean(tab.url));
    setBrowserTabs(tabs);
    setActive(0);
    setSection('browser-tabs');
  }
  function chooseBrowserTab(tab: {id:string;title:string;url:string}) {
    const reference = `Browser tab: ${tab.title}\nURL: ${tab.url}`;
    onChange([value.trim(), reference].filter(Boolean).join('\n\n'));
    setOpen(false);
    requestAnimationFrame(() => root.current?.querySelector('textarea')?.focus());
  }
  function onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>) {
    if(!open)return;
    if(section==='root'||section==='skills'||section==='modes') { if(event.key==='Escape'){event.preventDefault();setOpen(false);} return; }
    if(section==='browser-tabs') {
      if(event.key==='Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      else if(event.key==='ArrowDown'||event.key==='ArrowUp') {
        event.preventDefault();
        setActive(index=>Math.max(0,Math.min(browserTabs.length-1,index+(event.key==='ArrowDown'?1:-1))));
      } else if(event.key==='Enter'&&browserTabs[active]) {
        event.preventDefault(); event.stopPropagation(); chooseBrowserTab(browserTabs[active]);
      }
      return;
    }
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
      trigger:<IconAction type="button" className="as-nav-button" label="Add tools and plugins" hint="Add tools and plugins" aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
        onClick={()=>{setOpen(!open);setMentionFromComposer(false);setSection('root');setQuery('');setActive(0);setRevision(n=>n+1);}}><Plus size={19}/></IconAction>,
      onKeyDown,
      openPlugins:()=>{setOpen(true);setMentionFromComposer(false);setSection('mention');setQuery('');setActive(0);setRevision(n=>n+1);},
      onSelect:(position)=>{
        setCursor(position);
        setActive(0);
        const textarea=root.current?.querySelector('textarea');
        const typingMention=Boolean(textarea?.value.slice(0,position).match(/(?:^|\s)@([\w-]*)$/));
        if(typingMention&&!open)setRevision(n=>n+1);
        setMentionFromComposer(typingMention);
        if(typingMention)setSection('mention');
        setOpen(typingMention);
      },
    })}
    {open&&<div className="agentsam-plugin-menu" id={id} role="dialog" aria-label="Add to your message" data-placement={placement} data-section={section} data-typed-mention={Boolean(match)} style={{'--agentsam-plugin-menu-max-height':`${menuMaxHeight}px`} as CSSProperties}>
      {section!=='root'&&<div className="agentsam-plugin-heading">
        {!(section==='mention' && match) && <button type="button" className="as-nav-button" aria-label="Back to add menu" onClick={()=>{setSection('root');setQuery('');setActive(0);}}>Back</button>}
        <strong>{section==='skills'?'Skills':section==='modes'?'Agent mode':section==='browser-tabs'?'Add browser tabs':'Plugins and tools'}</strong>
        <IconAction type="button" className="as-nav-button" label="Close capabilities" onClick={()=>setOpen(false)}><X size={16}/></IconAction>
      </div>}
      {section==='root' ? <div className="agentsam-plugin-sections agentsam-plugin-root-list" data-work-plus-menu="">
        {onAttach&&<PlusMenuRow icon={<Upload size={17}/>} title="Add photos & files" hint="Upload from computer" onClick={()=>{setOpen(false);onAttach();}}/>}
        {onLibrary&&<PlusMenuRow icon={<Folder size={17}/>} title="Add from Library" hint="Browse saved media and files" onClick={()=>{setOpen(false);onLibrary();}}/>}
        {onImage&&<PlusMenuRow icon={<ImagePlus size={17}/>} title="Create image" hint="Visualize anything" onClick={()=>{setOpen(false);onImage();}}/>}
        <PlusMenuRow icon={<Globe size={17}/>} desktopOnly title="Add browser tabs" hint="Use open browser tabs" onClick={openBrowserTabPicker}/>
        {onWebSearch&&<PlusMenuRow icon={<Globe size={17}/>} title="Web search" hint="Find current information" onClick={()=>{setOpen(false);onWebSearch();}}/>}
        {onProject&&<PlusMenuRow icon={<Folder size={17}/>} title="Work in a project" hint="Start or continue work in a project" onClick={()=>{setOpen(false);onProject();}}/>}
        <div className="agentsam-plugin-section-divider" />
        <PlusMenuRow icon={<Plug size={17}/>} title="Plugins" hint="Search installed tools and connected services"
          onClick={()=>{setMentionFromComposer(false);setSection('mention');setQuery('');setActive(0);}}/>
        <div className="agentsam-plugin-section-divider" />
        {onModeChange&&<PlusMenuRow icon={<Bot size={17}/>} title={`Mode · ${(activeMode||'agent').replace(/^./,letter=>letter.toUpperCase())}`}
          hint="Agent, Ask, Plan, Debug or Multitask" onClick={()=>setSection('modes')}/>}
        <PlusMenuRow icon={<Sparkles size={17}/>} title="Skills" hint="Private instructions and knowledge" onClick={()=>setSection('skills')}/>
        <PlusMenuRow icon={<Plug size={17}/>} title="Manage plugins" hint="Install, enable and connect plugins"
          onClick={()=>{setOpen(false);window.dispatchEvent(new CustomEvent('agentsam:navigate',{detail:{to:'/admin/settings/customize?view=plugins'}}));}}/>
      </div> : section==='modes' ? <div className="agentsam-plugin-sections" data-work-plus-menu="">
        {([['agent','Execute and open surfaces'],['plan','Design technical plans'],['debug','Inspect, prove and fix'],['multitask','Coordinate managed workflows'],['ask','Answer questions']] as const).map(([mode,description])=><button key={mode} type="button" className="agentsam-plugin-row agentsam-plugin-row--compact" aria-pressed={activeMode===mode} onClick={()=>{onModeChange?.(mode);setOpen(false);}}><Bot size={16}/><span className="agentsam-plugin-row-copy"><strong>{mode[0].toUpperCase()+mode.slice(1)}</strong><small>{description}</small></span>{activeMode===mode?<Check size={16}/>:null}</button>)}
      </div> : section==='browser-tabs' ? <div className="agentsam-plugin-sections">
        {browserTabs.length ? browserTabs.map((tab,index)=><button key={tab.id} type="button" aria-label={tab.title} className="agentsam-plugin-row agentsam-plugin-row--compact" data-active={index===active} onClick={()=>chooseBrowserTab(tab)}>
          <Globe size={17}/><span className="agentsam-plugin-row-copy">{tab.title}<small>{tab.url}</small></span>
        </button>) : <>
          <p className="agentsam-plugin-notice">There are no open browser tabs yet. Open a page in AgentSam Browser, then return here to add it to your message.</p>
          <PlusMenuRow icon={<Globe size={17}/>} title="Open Browser" hint="Open a browser workspace" onClick={()=>{setOpen(false);openBrowserSideStage();}}/>
        </>}
      </div> : <>
        {!(section==='mention' && match) && <input type="search" aria-label={'Search '+section} placeholder={section==='mention'?'Search plugins and tools…':'Search '+section+'…'} value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}} className="agentsam-plugin-search" onKeyDown={event=>{
          if(event.key==='Escape'){event.preventDefault();setOpen(false);}
          if(section==='mention'&&(event.key==='ArrowDown'||event.key==='ArrowUp')){
            event.preventDefault();setActive(index=>Math.max(0,Math.min(shown.length-1,index+(event.key==='ArrowDown'?1:-1))));
          }
          if(section==='mention'&&event.key==='Enter'&&shown[active]){
            event.preventDefault();choose(shown[active]);
          }
        }}/>}
        {section==='skills' ? <>
          {skillsLoading&&<p role="status" className="agentsam-plugin-notice">Loading your skills…</p>}
          {skillsError&&<p role="alert" className="agentsam-plugin-notice">{skillsError} <button type="button" onClick={()=>setRevision(n=>n+1)}>Retry</button></p>}
          {!skillsLoading&&!skillsError&&!skills.length&&<p className="agentsam-plugin-notice">No private skills yet. Create one in Settings.</p>}
          {skills.filter(skill=>(skill.name+' '+skill.description+' '+skill.trigger).toLowerCase().includes(query.toLowerCase())).map(skill=><button type="button" key={skill.id} aria-label={skill.name} className="agentsam-plugin-row agentsam-plugin-row--compact" onClick={()=>{onChange(value+(value?' ':'')+'[skill:'+skill.id+'] '+skill.trigger+' ');setOpen(false);}}><Sparkles size={17}/><span className="agentsam-plugin-row-copy">{skill.name}<small>{skill.description||skill.trigger}</small></span></button>)}
          <a className="agentsam-plugin-row agentsam-plugin-row--compact" href="/admin/settings/skills"><Wrench size={17}/><span className="agentsam-plugin-row-copy"><strong>Manage skills</strong></span></a>
        </> : <>
          <div className="agentsam-plugin-results" role="listbox" aria-label="Available plugins and tools">
            {error&&<p role="status" className="agentsam-plugin-notice">Some connected services couldn't be loaded. Available tools are still shown.</p>}
            {loading&&<p role="status" className="agentsam-plugin-notice">Loading your plugins and tools…</p>}
            {!shown.length&&!loading&&<p className="agentsam-plugin-notice">No matching capabilities.</p>}
            {shown.map((entry,index)=><button type="button" key={entry.id} role="option" aria-selected={index===active} className="agentsam-plugin-row agentsam-plugin-row--compact" data-active={index===active} onClick={()=>choose(entry)}>
              {rowIcon(entry)}<span className="agentsam-plugin-row-copy"><strong>{entry.label}</strong><small>{entry.description||entry.status}</small></span>
              {<small className="agentsam-plugin-row-meta">{!entry.ready?(entry.status==='enable'?'Enable':entry.status==='reconnect'?'Reconnect':'Set up'):({plugin:'Plugin',connection:'Connection',mcp:'MCP',widget:'App',skill:'Skill',agent:'Agent',command:'Command'} as const)[entry.kind]}</small>}
            </button>)}
          </div>
        </>}
      </>}
    </div>}

  </div>;
}
