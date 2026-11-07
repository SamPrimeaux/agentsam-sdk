import { WorkspaceSourceRail, type IDEFileSource, type IDEFileSourceId } from './WorkspaceSourceRail.js';
import { WorkspaceTreeView } from './WorkspaceTreeView.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentSamMonacoEditor, type AgentSamEditorPalette, type AgentSamMonacoEditorProps } from '../monaco/editor.js';
import { WorkspaceSaveQueue, type SaveStatus } from '../workspace/save-queue.js';
import { visibleWorkspaceTree, workspaceParents } from '../workspace/tree.js';
import { DEFAULT_EDITOR_APPEARANCE, EDITOR_FONTS, normalizeEditorAppearance, type EditorAppearance, type EditorFontId } from './editor-appearance.js';
import { assertWorkspaceFile, normalizeWorkspacePath, type FileWorkspace, type WorkspaceDiagnostic, type WorkspaceEntry, type WorkspaceFile, type WorkspaceRevision, type WorkspaceSearchHit } from '../workspace/files.js';

export type WorkspaceEditorProps = {
  workspace: FileWorkspace;
  workspaceId: string;
  label: string;
  palette?: AgentSamEditorPalette;
  /** Authenticated LSP transport belongs to the host, not the IDE. */
  lsp?: AgentSamMonacoEditorProps['lsp'];
  onNavigate?: AgentSamMonacoEditorProps['onNavigate'];
  onApplyWorkspaceEdit?: AgentSamMonacoEditorProps['onApplyWorkspaceEdit'];
  sources?: IDEFileSource[];
  sourceId?: IDEFileSourceId;
  onSourceSelect?: (source: IDEFileSourceId) => void;
  showHostModes?: boolean;
  onExit?: () => void;
  agent?: { label: string; propose(input: {path: string; content: string; version: string}): Promise<{content: string; explanation: string}> };
};
type Tab = WorkspaceFile & { value: string; status: SaveStatus; diagnostics: WorkspaceDiagnostic[]; editorDiagnostics: WorkspaceDiagnostic[]; error?: string };
type Panel = 'Explorer' | 'Search' | 'Timeline' | 'Problems' | 'Changes' | 'Snapshot' | 'References' | 'Dependencies';

export function WorkspaceEditor({workspace, workspaceId, label, palette, onExit, agent, lsp, onNavigate, onApplyWorkspaceEdit, sources, sourceId = 'local', onSourceSelect, showHostModes = false}: WorkspaceEditorProps) {
  const [tree,setTree]=useState<WorkspaceEntry[]>([]);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const [tabs,setTabs]=useState<Tab[]>([]);
  const [active,setActive]=useState('');
  const [panel,setPanel]=useState<Panel>('Explorer');
  const [query,setQuery]=useState('');
  const [hits,setHits]=useState<WorkspaceSearchHit[]>([]);
  const [history,setHistory]=useState<WorkspaceRevision[]>([]);
  const [modal,setModal]=useState<'file'|'folder'|'rename'|null>(null);
  const [pathInput,setPathInput]=useState('');
  const [paletteMode,setPaletteMode]=useState<'file'|'command'|null>(null);
  const [paletteQuery,setPaletteQuery]=useState('');
  const [contextMenu,setContextMenu]=useState<{path:string;x:number;y:number}|null>(null);
  const [split,setSplit]=useState(false);
  const [appearance,setAppearance]=useState<EditorAppearance>(DEFAULT_EDITOR_APPEARANCE);
  const [appearanceReady,setAppearanceReady]=useState(false);
  const [appearanceOpen,setAppearanceOpen]=useState(false);
  const [cursor,setCursor]=useState({line:1,column:1});
  const [message,setMessage]=useState('');
  const [changeEntries,setChangeEntries]=useState<import('../workspace/files.js').WorkspaceChange[]>([]);
  const [snapshot,setSnapshot]=useState<import('../workspace/files.js').WorkspaceSnapshot|null>(null);
  const [modeLoading,setModeLoading]=useState(false);
  const [theirs,setTheirs]=useState<string|null>(null);
  const [proposal,setProposal]=useState<{path:string;content:string;explanation:string}|null>(null);
  const [agentBusy,setAgentBusy]=useState(false);
  const latestTabs=useRef(tabs);latestTabs.current=tabs;
  const latestActive=useRef(active);latestActive.current=active;
  const current=tabs.find(tab=>tab.path===active);
  const menuEntry=contextMenu?tree.find(entry=>entry.path===contextMenu.path):null;
  const visibleTree=useMemo(()=>visibleWorkspaceTree(tree,expanded),[tree,expanded]);
  const loadedFolders=useRef<Set<string>>(new Set());
  const readonly=workspace.configuration?.readonly===true;
  const toggleFolder=async(path:string)=>{
    if(expanded.has(path)){
      setExpanded(prev=>{const next=new Set(prev);next.delete(path);return next;});return;
    }
    if(!loadedFolders.current.has(path)){
      try{
        const children=await workspace.list(path);
        // The host is the authority for children. Lazy source providers do not
        // need to fetch every folder's contents just to display the root.
        setTree(prev=>[...new Map([...prev,...children].map(item=>[item.path,item])).values()]);
        loadedFolders.current.add(path);
      }catch(error){setMessage(error instanceof Error?error.message:String(error));return;}
    }
    setExpanded(prev=>new Set([...prev,path]));
  };
  useEffect(()=>{
    try { setAppearance(normalizeEditorAppearance(JSON.parse(localStorage.getItem('agentsam-ide:editor-appearance-v1')||'null'))); }
    catch { setAppearance(DEFAULT_EDITOR_APPEARANCE); }
    setAppearanceReady(true);
  },[]);
  useEffect(()=>{
    if(!appearanceReady)return;
    try { localStorage.setItem('agentsam-ide:editor-appearance-v1',JSON.stringify(appearance)); }catch { /* Private browsing may prevent local UI preferences. */ }
  },[appearance,appearanceReady]);
  const updateAppearance=(change:Partial<EditorAppearance>)=>setAppearance(prev=>normalizeEditorAppearance({...prev,...change}));

  const queue=useMemo(()=>new WorkspaceSaveQueue({
    debounceMs:900,
    manualSave: workspace.configuration?.manualSave,
    write: async (path,content,version,overwrite)=>{
      const result=await workspace.write(path,content,version,{overwrite});
      return result.ok?{ok:true as const,version:result.file.version}:{ok:false as const,error:result.message,code:result.code};
    },
    onStatus:(path,status,error)=>{
      setTabs(prev=>prev.map(tab=>tab.path===path?{...tab,status,error}:tab));
      if(error)setMessage(error);
    },
    onCommitted:(path,_text,result)=>setTabs(prev=>prev.map(tab=>tab.path===path?{...tab,version:result.version}:tab)),
  }),[workspace]);

  const refresh=useCallback(async()=>{
    try{setTree(await workspace.list());setMessage('');}
    catch(e){setMessage(e instanceof Error?e.message:String(e));}
  },[workspace]);
  useEffect(()=>{void refresh();},[refresh]);

  const open=useCallback(async(path:string)=>{
    setExpanded(prev=>new Set([...prev,...workspaceParents(path)]));
    if(latestTabs.current.some(tab=>tab.path===path)){setActive(path);return;}
    try{
      const file=assertWorkspaceFile(await workspace.read(path));
      queue.acceptDiskVersion(file.path,file.version);
      setTabs(prev=>prev.some(tab=>tab.path===file.path)?prev:[...prev,{...file,value:file.content,status:'saved',diagnostics:[],editorDiagnostics:[]}]);
      setActive(file.path);setMessage('');
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  },[queue,workspace]);

  const edit=(path:string,value:string)=>{
    if(readonly||latestTabs.current.find(tab=>tab.path===path)?.readonly)return;
    setTabs(prev=>prev.map(tab=>tab.path===path?{...tab,value}:tab));
    queue.edit(path,value);
  };
  const save=useCallback(async(path:string,force=false)=>{
    const tab=latestTabs.current.find(item=>item.path===path);
    if(!tab||tab.readonly||readonly)return;
    if(workspace.validate){
      try{
        const diagnostics=await workspace.validate(path,tab.value);
        setTabs(prev=>prev.map(item=>item.path===path?{...item,diagnostics}:item));
        if(diagnostics.some(d=>d.severity==='error'&&d.blocksSave)){
          setPanel('Problems');setMessage('Resolve the blocking problems before saving.');return;
        }
      }catch(e){setMessage(e instanceof Error?e.message:String(e));return;}
    }
    await queue.flush(path,force);
  },[queue,workspace]);

  useEffect(()=>{
    const handle=(event:BeforeUnloadEvent)=>{
      if(latestTabs.current.some(tab=>tab.status!=='saved')){
        event.preventDefault();event.returnValue='';
      }
    };
    window.addEventListener('beforeunload',handle);
    return()=>window.removeEventListener('beforeunload',handle);
  },[]);

  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{
      if(!(e.metaKey||e.ctrlKey))return;
      const k=e.key.toLowerCase();
      if(k==='s'){e.preventDefault();if(latestActive.current)void save(latestActive.current);}
      if(k==='p'){e.preventDefault();setPaletteMode(e.shiftKey?'command':'file');setPaletteQuery('');}
      if(k==='f'&&e.shiftKey){e.preventDefault();setPanel('Search');}
    };
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  },[save]);

  const closeTab=(path:string)=>{
    const tab=latestTabs.current.find(t=>t.path===path);
    if(tab?.status!=='saved'){setMessage('Save this file before closing. Unsaved edits remain in the buffer.');return;}
    setTabs(prev=>prev.filter(t=>t.path!==path));
    if(latestActive.current===path)setActive(latestTabs.current.find(t=>t.path!==path)?.path||'');
  };
  const reload=async()=>{
    if(!current)return;
    try{
      const file=assertWorkspaceFile(await workspace.read(current.path));
      queue.discardDraft(current.path,file.version);
      setTabs(prev=>prev.map(t=>t.path===file.path?{...file,value:file.content,status:'saved',diagnostics:[],editorDiagnostics:[]}:t));
      setTheirs(null);setMessage('Loaded the saved version.');
    }catch(e){setMessage(String(e));}
  };
  const find=async()=>{setPanel('Search');try{setHits(await workspace.search(query));}catch(e){setMessage(String(e));}};
  const showHistory=async()=>{
    if(!current)return;setPanel('Timeline');
    try{setHistory(await workspace.history(current.path));}catch(e){setMessage(String(e));}
  };
  const restore=async(rev:WorkspaceRevision)=>{
    if(!current||!window.confirm('Restore this saved revision?'))return;
    try{
      const result=await workspace.restore(current.path,rev.id,current.version);
      if(!result.ok){setMessage(result.message);return;}
      queue.discardDraft(current.path,result.file.version);
      setTabs(prev=>prev.map(t=>t.path===current.path?{...result.file,value:result.file.content,status:'saved',diagnostics:[],editorDiagnostics:[]}:t));
      setMessage('Revision restored.');setHistory(await workspace.history(current.path));
    }catch(e){setMessage(String(e));}
  };
  const create=async()=>{
    if(readonly){setMessage('This provider is read-only.');return;}
    try{
      const path=normalizeWorkspacePath(pathInput,modal==='folder'?'folder':'file');
      if(modal==='rename'&&current){
        if(current.status!=='saved')throw Error('Save before renaming.');
        await workspace.rename(current.path,path);closeTab(current.path);await open(path);
      }else{
        await workspace.create(path,modal==='folder'?'folder':'file');
        if(modal==='file')await open(path);
      }
      setModal(null);setPathInput('');await refresh();
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  };
  const remove=async()=>{
    if(readonly||!current||current.status!=='saved'||!window.confirm('Delete '+current.path+'?'))return;
    try{await workspace.delete(current.path,current.version);closeTab(current.path);await refresh();}
    catch(e){setMessage(String(e));}
  };
  const ask=async()=>{
    if(!current||!agent||agentBusy)return;
    setAgentBusy(true);
    try{setProposal({path:current.path,...await agent.propose({path:current.path,content:current.value,version:current.version})});}
    catch(e){setMessage(String(e));}
    finally{setAgentBusy(false);}
  };
  const showChanges=async()=>{
    setPanel('Changes');
    if(!workspace.changes){setMessage('Changes are unavailable: this workspace has no authorized Git/diff provider.');return;}
    setModeLoading(true);
    try{setChangeEntries(await workspace.changes());setMessage('');}
    catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setModeLoading(false);}
  };
  const showSnapshot=async()=>{
    setPanel('Snapshot');
    if(!workspace.snapshot){setMessage('Merkle snapshots are unavailable until a trusted workspace snapshot provider is connected.');return;}
    setModeLoading(true);
    try{const result=await workspace.snapshot();if(!result.rootHash)throw new Error('Host returned a snapshot without a root hash.');setSnapshot(result);setMessage('');}
    catch(e){setMessage(e instanceof Error?e.message:String(e));}
    finally{setModeLoading(false);}
  };
  const commands=[
    {name:'Save',run:()=>current&&void save(current.path)},
    {name:'New file',run:()=>{setModal('file');setPathInput('');}},
    {name:'New folder',run:()=>{setModal('folder');setPathInput('');}},
    {name:'Find in files',run:()=>setPanel('Search')},
    {name:'Timeline',run:()=>void showHistory()},
    {name:'Refresh',run:()=>void refresh()},
    {name:'Changes',run:()=>void showChanges()},
    {name:'Merkle snapshot',run:()=>void showSnapshot()},
    {name:'Editor appearance',run:()=>setAppearanceOpen(true)},
    {name:'Split editor',run:()=>setSplit(!split)},
  ];
  const rendered=(tab:Tab)=><AgentSamMonacoEditor document={{workspaceId,path:tab.path,text:tab.value,languageId:tab.language}}
    onChange={value=>edit(tab.path,value)} onSave={()=>save(tab.path)} palette={palette} readOnly={Boolean(readonly||tab.readonly)}
    onDiagnostics={markers=>setTabs(prev=>prev.map(item=>item.path===tab.path?{...item,editorDiagnostics:markers.map(marker=>({
      path:tab.path,message:marker.message,severity:marker.severity>=8?'error':marker.severity>=4?'warning':'info',
      line:marker.startLineNumber,column:marker.startColumn,
    }))}:item))}
    savedVersion={tab.version} lsp={lsp} onNavigate={onNavigate} onApplyWorkspaceEdit={onApplyWorkspaceEdit} onSelectionChange={s=>setCursor({line:s.startLine,column:s.startColumn})}
    options={{fontFamily:EDITOR_FONTS.find(font=>font.id===appearance.fontId)!.family,fontSize:appearance.fontSize,
      minimap:{enabled:appearance.minimap},wordWrap:appearance.wordWrap?'on':'off'}} height="100%"/>;
  const availablePanels:Panel[]=['Explorer','Search','Timeline','Problems',...(showHostModes?['Changes' as const,'Snapshot' as const]:[]),...(workspace.configuration?.references?.length?['References' as const]:[]),...(workspace.configuration?.dependencies?.length?['Dependencies' as const]:[])];
  const problems=tabs.flatMap(tab=>[...tab.diagnostics,...tab.editorDiagnostics].map(item=>({...item,path:tab.path})));
  const dirty=current&&current.status!=='saved';
  return <div className="asi-ide">
    <header className="asi-toolbar">
      <strong>{label}</strong>
      <nav aria-label="Editor actions">
        <button type="button" onClick={()=>setPaletteMode('file')}>Open file</button>
        <button type="button" onClick={()=>{setPaletteMode('command');setPaletteQuery('');}}>Commands</button>
        <button type="button" disabled={!current} onClick={()=>setSplit(!split)}>{split?'Close split':'Split'}</button>
        <button type="button" disabled={!current} onClick={()=>void showHistory()}>History</button>
        <button type="button" aria-label="Editor appearance" aria-expanded={appearanceOpen} onClick={()=>setAppearanceOpen(value=>!value)}>Font</button>
        <button type="button" disabled={!current||current.readonly||readonly} onClick={()=>current&&void save(current.path)}>{current?.status==='saving'?'Saving…':'Save'}</button>
        {onExit&&<button type="button" onClick={()=>{if(tabs.some(t=>t.status!=='saved')){setMessage('Save all changes before exiting.');return;}onExit();}}>Close</button>}
      </nav>
    </header>
    {appearanceOpen&&<div className="asi-appearance-panel" role="group" aria-label="Editor appearance">
      <label>Font<select aria-label="Editor font" value={appearance.fontId}
        onChange={event=>updateAppearance({fontId:event.target.value as EditorFontId})}>
        {EDITOR_FONTS.map(font=><option key={font.id} value={font.id}>{font.label}</option>)}
      </select></label>
      <label>Size<input type="number" aria-label="Editor font size" min={11} max={24} step={1}
        value={appearance.fontSize} onChange={event=>updateAppearance({fontSize:Number(event.target.value)})}/></label>
      <label><input type="checkbox" checked={appearance.minimap}
        onChange={event=>updateAppearance({minimap:event.target.checked})}/>Minimap</label>
      <label><input type="checkbox" checked={appearance.wordWrap}
        onChange={event=>updateAppearance({wordWrap:event.target.checked})}/>Wrap lines</label>
      <button type="button" onClick={()=>setAppearanceOpen(false)}>Done</button>
    </div>}
    <div className="asi-main">
      <aside className="asi-aside" aria-label="Editor sidebar">
        {sources?.length ? <WorkspaceSourceRail sources={sources} sourceId={sourceId} onSelect={onSourceSelect} /> : null}
        <nav className="asi-sidebar-nav">{availablePanels.map(name=><button type="button" aria-current={panel===name} key={name} onClick={()=>name==='Timeline'?void showHistory():name==='Changes'?void showChanges():name==='Snapshot'?void showSnapshot():setPanel(name)}>{name}</button>)}</nav>
        <div className="asi-side-content">
          {panel==='Explorer'&&<><div className="asi-side-header"><strong>Explorer</strong><div><button type="button" disabled={readonly} aria-label="New file" onClick={()=>{setModal('file');setPathInput('');}}>＋</button><button type="button" disabled={readonly} aria-label="New folder" onClick={()=>{setModal('folder');setPathInput('');}}>▣</button><button type="button" aria-label="Refresh files" onClick={()=>void refresh()}>↻</button></div></div>
            <WorkspaceTreeView entries={visibleTree} expanded={expanded} active={active}
              onFile={path=>void open(path)} onFolder={path=>void toggleFolder(path)}
              onMenu={(entry,point)=>setContextMenu({path:entry.path,x:Math.max(8,Math.min(point.x,window.innerWidth-220)),y:Math.max(8,Math.min(point.y,window.innerHeight-230))})}/></>}
          {panel==='Search'&&<><div className="asi-side-header"><strong>Find in files</strong></div><form className="asi-search" onSubmit={e=>{e.preventDefault();void find();}}><input value={query} aria-label="Search workspace" onChange={e=>setQuery(e.target.value)}/><button type="submit">Find</button></form>{hits.map((hit,i)=><button key={i} className="asi-hit" type="button" onClick={()=>void open(hit.path)}><strong>{hit.path}:{hit.line}</strong><span>{hit.preview}</span></button>)}</>}
          {panel==='Timeline'&&<><div className="asi-side-header"><strong>Timeline</strong></div>{history.map(rev=><div key={rev.id} className="asi-revision"><span>{rev.label||rev.createdAt}</span><button type="button" onClick={()=>void restore(rev)}>Restore</button></div>)}</>}
          {panel==='Problems'&&<><div className="asi-side-header"><strong>Problems · {problems.length}</strong></div>{problems.map((problem,i)=><button key={i} className="asi-hit" type="button" onClick={()=>void open(problem.path)}>{problem.severity}: {problem.path} — {problem.message}</button>)}</>}
          {panel==='Changes'&&<><div className="asi-side-header"><strong>Changes</strong><button type="button" aria-label="Refresh changes" onClick={()=>void showChanges()}>↻</button></div>
            {modeLoading?<p>Inspecting verified changes…</p>:!workspace.changes?<p>No Git/diff provider is connected to this workspace.</p>:changeEntries.length===0?<p>No reported changes.</p>:changeEntries.map((entry,i)=><button className="asi-hit" key={entry.path+String(i)} type="button" onClick={()=>void open(entry.path)}><strong>{entry.status}</strong><span>{entry.path}</span></button>)}</>}
          {panel==='Snapshot'&&<><div className="asi-side-header"><strong>Merkle snapshot</strong><button type="button" aria-label="Refresh Merkle snapshot" onClick={()=>void showSnapshot()}>↻</button></div>
            {!workspace.snapshot?<p>No verified snapshot provider is connected.</p>:snapshot?<div className="asi-snapshot">
              <p><strong>{snapshot.persistence==='durable'?'Persisted snapshot':snapshot.persistence==='session'?'Session-only snapshot':'Snapshot persistence unverified'}</strong></p>
              {snapshot.persistence!=='durable'&&<p>This hash has not been registered as a repository/workspace-linked release snapshot in D1. Select an authorized repository and workspace in the host before requesting a durable snapshot.</p>}
              <strong>{snapshot.rootHash}</strong><p>{snapshot.fileCount} tracked files · {snapshot.createdAt}</p>{snapshot.entries?.map(item=><p key={item.path}>{item.path} — {item.hash}</p>)}</div>:<p>{modeLoading?'Reading trusted snapshot…':'No snapshot loaded.'}</p>}</>}
          {panel==='References'&&workspace.configuration?.references?.map(item=><p key={item}>{item}</p>)}
          {panel==='Dependencies'&&workspace.configuration?.dependencies?.map(item=><p key={item}>{item}</p>)}
        </div>
      </aside>
      <section className="asi-center" aria-label="Code editor">
        <div className="asi-tabs" role="tablist">{tabs.map(tab=><div key={tab.path} role="tab" aria-selected={active===tab.path}><button type="button" onClick={()=>setActive(tab.path)}>{tab.displayName||tab.path.split('/').at(-1)}{tab.status!=='saved'?' ●':''}</button><button type="button" aria-label={'Close '+tab.path} onClick={()=>closeTab(tab.path)}>×</button></div>)}</div>
        {current?<><div className="asi-breadcrumb">{current.displayName||current.path.split('/').join(' › ')}<div><button type="button" onClick={()=>{setModal('rename');setPathInput(current.path);}} disabled={readonly||Boolean(dirty)||current.canRename===false}>Rename</button><button type="button" onClick={()=>void remove()} disabled={readonly||Boolean(dirty)||current.canDelete===false}>Delete</button></div></div>
        <div className={'asi-editors'+(split?' asi-split':'')}><div>{rendered(current)}</div>{split&&<div>{rendered(current)}</div>}</div>
        {current.status==='conflict'&&<div className="asi-alert" role="alert"><strong>File changed elsewhere. Your edits are preserved.</strong><button type="button" onClick={()=>void reload()}>Reload theirs</button><button type="button" onClick={()=>{if(window.confirm('Overwrite the currently saved content? This may replace another writer’s changes. Version history is only available when the provider supports it.'))void save(current.path,true);}}>Overwrite</button><button type="button" onClick={async()=>{try{setTheirs((await workspace.read(current.path)).content);}catch(e){setMessage(String(e));}}}>Compare</button></div>}
        {current.status==='error'&&<div className="asi-alert" role="alert"><strong>Save failed. Your changes remain available.</strong><button type="button" onClick={()=>void save(current.path)}>Retry</button></div>}
        {theirs!==null&&<div className="asi-diff"><div><strong>Saved version</strong><pre>{theirs}</pre></div><div><strong>Your changes</strong><pre>{current.value}</pre></div><button type="button" onClick={()=>setTheirs(null)}>Close comparison</button></div>}
        {proposal?.path===current.path&&<div className="asi-alert"><strong>{proposal.explanation}</strong><button type="button" onClick={()=>{edit(current.path,proposal.content);setProposal(null);}}>Apply patch to buffer</button><button type="button" onClick={()=>setProposal(null)}>Discard</button></div>}
        </>:<div className="asi-welcome">Choose a file in Explorer or press ⌘P.</div>}
      </section>
    </div>
    {contextMenu&&menuEntry&&<><button type="button" className="asi-context-dismiss" aria-label="Dismiss file menu" onClick={()=>setContextMenu(null)}/>
      <div role="menu" aria-label={"File actions for "+menuEntry.path} className="asi-context-menu"
        style={{left:contextMenu.x,top:contextMenu.y}} onKeyDown={event=>{if(event.key==='Escape')setContextMenu(null)}}>
        <div className="asi-context-title">{menuEntry.path.split('/').at(-1)}</div>
        <button type="button" role="menuitem" onClick={()=>{const target=menuEntry;setContextMenu(null);void (target.kind==='folder'?toggleFolder(target.path):open(target.path));}}>{menuEntry.kind==='folder'?'Toggle folder':'Open file'}</button>
        <button type="button" role="menuitem" onClick={()=>{void navigator.clipboard?.writeText(menuEntry.path).then(()=>setMessage('Copied workspace-relative path.')).catch(()=>setMessage('Clipboard permission unavailable.'));setContextMenu(null);}}>Copy relative path</button>
        {!readonly&&<>
          <div className="asi-context-separator"/>
          <button type="button" role="menuitem" onClick={()=>{const parent=menuEntry.kind==='folder'?menuEntry.path:workspaceParents(menuEntry.path).at(-1)||'';setContextMenu(null);setModal('file');setPathInput(parent?parent+'/':'');}}>New file here</button>
          <button type="button" role="menuitem" onClick={()=>{const parent=menuEntry.kind==='folder'?menuEntry.path:workspaceParents(menuEntry.path).at(-1)||'';setContextMenu(null);setModal('folder');setPathInput(parent?parent+'/':'');}}>New folder here</button>
          {menuEntry.kind==='file'&&current?.path===menuEntry.path&&current.status==='saved'&&<>
            <div className="asi-context-separator"/>
            <button type="button" role="menuitem" disabled={current.canRename===false} onClick={()=>{setContextMenu(null);setModal('rename');setPathInput(menuEntry.path);}}>Rename selected file</button>
            <button type="button" role="menuitem" disabled={current.canDelete===false} onClick={()=>{setContextMenu(null);void remove();}}>Delete selected file…</button>
          </>}
        </>}
      </div>
    </>}
    {agent&&current&&<div className="asi-agent"><button type="button" disabled={agentBusy} onClick={()=>void ask()}>{agentBusy?'Preparing proposal…':'Work with '+agent.label}</button></div>}
    <footer className="asi-status"><span>{label}</span><span>{current?.status||''}</span><span>Ln {cursor.line}, Col {cursor.column}</span><span>{current?.eol||'LF'}</span><span>{current?.encoding||'UTF-8'}</span><span>{current?.language||'Text'}</span><button type="button" onClick={()=>setPanel('Problems')}>{problems.length} problems</button></footer>
    {message&&<div className="asi-message" role="status">{message}<button type="button" onClick={()=>setMessage('')}>×</button></div>}
    {modal&&<div className="asi-overlay"><form className="asi-dialog" onSubmit={e=>{e.preventDefault();void create();}}><strong>{modal==='rename'?'Rename file':'New '+modal}</strong><input autoFocus value={pathInput} aria-label="Workspace path" onChange={e=>setPathInput(e.target.value)} placeholder="folder/name.ext"/><div><button type="button" onClick={()=>setModal(null)}>Cancel</button><button type="submit">Confirm</button></div></form></div>}
    {paletteMode&&<div className="asi-overlay"><div className="asi-dialog" role="dialog" aria-modal="true"><input autoFocus aria-label="Command palette" value={paletteQuery} onKeyDown={e=>e.key==='Escape'&&setPaletteMode(null)} onChange={e=>setPaletteQuery(e.target.value)} placeholder={paletteMode==='file'?'Go to file…':'Run command…'}/><div className="asi-palette-results">{paletteMode==='file'?tree.filter(f=>f.kind==='file'&&f.path.toLowerCase().includes(paletteQuery.toLowerCase())).map(f=><button key={f.path} type="button" onClick={()=>{setPaletteMode(null);void open(f.path);}}>{f.path}</button>):commands.filter(c=>c.name.toLowerCase().includes(paletteQuery.toLowerCase())).map(c=><button key={c.name} type="button" onClick={()=>{setPaletteMode(null);c.run();}}>{c.name}</button>)}</div><button type="button" onClick={()=>setPaletteMode(null)}>Close</button></div></div>}
  </div>;
}
