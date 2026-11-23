import { WorkspaceSourceRail, type IDEFileSource, type IDEFileSourceId } from './WorkspaceSourceRail.js';
import { mediaKindForPath, isMarkdownPath, isHtmlPath } from '../workspace/media.js';
import { WorkspaceTreeView } from './WorkspaceTreeView.js';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AgentSamMonacoEditor, type AgentSamEditorPalette, type AgentSamMonacoEditorProps } from '../monaco/editor.js';
import { WorkspaceSaveQueue, type SaveStatus } from '../workspace/save-queue.js';
import { createWorkspaceTextFile } from '../workspace/file-creation.js';
import { languageIdFromPath } from '../monaco/model.js';
import { visibleWorkspaceTree, workspaceParents } from '../workspace/tree.js';
import { DEFAULT_EDITOR_APPEARANCE, EDITOR_FONTS, normalizeEditorAppearance, type EditorAppearance, type EditorFontId } from './editor-appearance.js';
import { assertWorkspaceFile, normalizeWorkspacePath, type FileWorkspace, type WorkspaceDiagnostic, type WorkspaceEntry, type WorkspaceFile, type WorkspaceRevision, type WorkspaceSearchHit, type WorkspacePreview } from '../workspace/files.js';

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
  /** Connections and provisioning are owned by the embedding host, not Monaco. */
  onReconnect?: () => void;
  onConnectionSettings?: () => void;
  /** Host-owned source context for the agent; never includes OAuth credentials. */
  onActiveFileChange?: (file: {path:string;version:string}|null) => void;
  /** Preserve unsaved untitled buffers across host source changes. */
  initialUntitledDrafts?: UntitledEditorDraft[];
  onUntitledDraftsChange?: (drafts: UntitledEditorDraft[]) => void;
  /** A host-owned reconnect / account picker, rendered without leaving Monaco. */
  connectionPanel?: ReactNode;
  /** Host-owned full Markdown renderer; avoids bundling an untrusted parser into the portable IDE. */
  renderMarkdown?: (content:string) => ReactNode;
  onExit?: () => void;
  agent?: { label: string; propose(input: {path: string; content: string; version: string}): Promise<{content: string; explanation: string}> };
};
export type UntitledEditorDraft = {
  path: string;
  displayName: string;
  value: string;
  language?: string;
  targetDirectory?: string;
};
type Tab = WorkspaceFile & { untitled?: boolean; targetDirectory?: string; value: string; status: SaveStatus; diagnostics: WorkspaceDiagnostic[]; editorDiagnostics: WorkspaceDiagnostic[]; error?: string; preview?: WorkspacePreview };
type Panel = 'Explorer' | 'Search' | 'Timeline' | 'Problems' | 'Changes' | 'Snapshot' | 'References' | 'Dependencies';

export function WorkspaceEditor({workspace, workspaceId, label, palette, onExit, agent, lsp, onNavigate, onApplyWorkspaceEdit, sources, sourceId = 'local', onSourceSelect, showHostModes = false, renderMarkdown, onReconnect, onConnectionSettings, onActiveFileChange, initialUntitledDrafts, onUntitledDraftsChange, connectionPanel}: WorkspaceEditorProps) {
  const [tree,setTree]=useState<WorkspaceEntry[]>([]);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const [tabs,setTabs]=useState<Tab[]>(()=>(initialUntitledDrafts||[]).map(draft=>({
    path:draft.path,displayName:draft.displayName,content:draft.value,value:draft.value,
    version:'untitled',language:draft.language||'plaintext',status:'modified',untitled:true,
    targetDirectory:draft.targetDirectory,diagnostics:[],editorDiagnostics:[],
  })));
  const [active,setActive]=useState(()=>initialUntitledDrafts?.[0]?.path||'');
  const [panel,setPanel]=useState<Panel>('Explorer');
  const [query,setQuery]=useState('');
  const [hits,setHits]=useState<WorkspaceSearchHit[]>([]);
  const [history,setHistory]=useState<WorkspaceRevision[]>([]);
  const [modal,setModal]=useState<'folder'|'rename'|'saveAs'|null>(null);
  const [dialogError,setDialogError]=useState('');
  const [savingDraft,setSavingDraft]=useState(false);
  const [confirmation,setConfirmation]=useState<{kind:'delete'|'restore'|'overwrite';revision?:WorkspaceRevision}|null>(null);
  const draftCounter=useRef(initialUntitledDrafts?.length||0);
  const [pathInput,setPathInput]=useState('');
  const [paletteMode,setPaletteMode]=useState<'file'|'command'|null>(null);
  const [paletteQuery,setPaletteQuery]=useState('');
  const [paletteSelection,setPaletteSelection]=useState(0);
  const [contextMenu,setContextMenu]=useState<{path:string;x:number;y:number}|null>(null);
  const [split,setSplit]=useState(false);
  const [previewOnly,setPreviewOnly]=useState(false);
  const [appearance,setAppearance]=useState<EditorAppearance>(DEFAULT_EDITOR_APPEARANCE);
  const [appearanceReady,setAppearanceReady]=useState(false);
  const [appearanceOpen,setAppearanceOpen]=useState(false);
  const [sourceSettingsOpen,setSourceSettingsOpen]=useState(false);
  const [cursor,setCursor]=useState({line:1,column:1});
  const [message,setMessage]=useState('');
  const [treeError,setTreeError]=useState('');
  const [problemsOpen,setProblemsOpen]=useState(false);
  const [revealRequest,setRevealRequest]=useState<{path:string;line:number;column:number;requestId:number}|null>(null);
  const [sidebarWidth,setSidebarWidth]=useState(235);
  const [explorerOpen,setExplorerOpen]=useState(true);
  const [splitPercent,setSplitPercent]=useState(50);
  const [changeEntries,setChangeEntries]=useState<import('../workspace/files.js').WorkspaceChange[]>([]);
  const [snapshot,setSnapshot]=useState<import('../workspace/files.js').WorkspaceSnapshot|null>(null);
  const [modeLoading,setModeLoading]=useState(false);
  const [theirs,setTheirs]=useState<string|null>(null);
  const [proposal,setProposal]=useState<{path:string;content:string;explanation:string}|null>(null);
  const [agentBusy,setAgentBusy]=useState(false);
  const latestTabs=useRef(tabs);latestTabs.current=tabs;
  const latestActive=useRef(active);latestActive.current=active;
  const current=tabs.find(tab=>tab.path===active);
  useEffect(()=>{
    onUntitledDraftsChange?.(tabs.filter(tab=>tab.untitled).map(tab=>({
      path:tab.path,displayName:tab.displayName||'Untitled',
      value:tab.value,language:tab.language,targetDirectory:tab.targetDirectory,
    })));
  },[tabs,onUntitledDraftsChange]);
  const menuEntry=contextMenu?tree.find(entry=>entry.path===contextMenu.path):null;
  const visibleTree=useMemo(()=>visibleWorkspaceTree(tree,expanded),[tree,expanded]);
  const loadedFolders=useRef<Set<string>>(new Set());
  const readonly=workspace.configuration?.readonly===true;
  const operations=workspace.configuration?.capabilities;
  const canCreate=!readonly&&operations?.create!==false;
  const canRename=!readonly&&operations?.rename!==false;
  const canDelete=!readonly&&operations?.delete!==false;
  const canSearch=operations?.search!==false;
  const canHistory=operations?.history!==false;
  const canChanges=Boolean(workspace.changes)&&operations?.changes!==false;
  const canSnapshot=Boolean(workspace.snapshot)&&operations?.snapshot!==false;
  const createUntitled=(parent='')=>{
    const number=++draftCounter.current;
    const path='__agentsam_untitled__/'+crypto.randomUUID();
    const tab:Tab={
      path,displayName:'Untitled-'+number,content:'',value:'',version:'untitled',
      language:'plaintext',status:'modified',untitled:true,targetDirectory:parent,
      diagnostics:[],editorDiagnostics:[],
    };
    setTabs(previous=>[...previous,tab]);
    setActive(path);
    setPanel('Explorer');
    setPreviewOnly(false);
    setMessage('');
  };
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
      if(!result.ok && result.diagnostics?.length){
        setTabs(prev=>prev.map(tab=>tab.path===path?{...tab,diagnostics:result.diagnostics||[]}:tab));
        setProblemsOpen(true);
      }
      return result.ok?{ok:true as const,version:result.file.version}:{ok:false as const,error:result.message,code:result.code};
    },
    onStatus:(path,status,error)=>{
      setTabs(prev=>prev.map(tab=>tab.path===path?{...tab,status,error}:tab));
      if(error)setMessage(error);
    },
    onCommitted:(path,_text,result)=>setTabs(prev=>prev.map(tab=>tab.path===path?{...tab,version:result.version}:tab)),
  }),[workspace]);

  const refresh=useCallback(async()=>{
    try{setTree(await workspace.list());setTreeError('');setMessage('');}
    catch(e){const reason=e instanceof Error?e.message:String(e);setTree([]);setTreeError(reason);setMessage(reason);}
  },[workspace]);
  useEffect(()=>{void refresh();},[refresh]);

  const open=useCallback(async(path:string)=>{
    setExpanded(prev=>new Set([...prev,...workspaceParents(path)]));
    if(latestTabs.current.some(tab=>tab.path===path)){setActive(path);return;}
    try{
      if (workspace.preview && mediaKindForPath(path)) {
        const preview=await workspace.preview(path);
        if(preview) {
          const asset:Tab={path,content:'',value:'',version:preview.version||'media-preview',readonly:true,
            status:'saved',diagnostics:[],editorDiagnostics:[],preview};
          setTabs(prev=>prev.some(tab=>tab.path===path)?prev:[...prev,asset]);
          setActive(path);setMessage('');return;
        }
      }
      const file=assertWorkspaceFile(await workspace.read(path));
      queue.acceptDiskVersion(file.path,file.version);
      setTabs(prev=>prev.some(tab=>tab.path===file.path)?prev:[...prev,{...file,value:file.content,status:'saved',diagnostics:[],editorDiagnostics:[]}]);
      setActive(file.path);setMessage('');
    }catch(e){setMessage(e instanceof Error?e.message:String(e));}
  },[queue,workspace]);

  const edit=(path:string,value:string)=>{
    const tab=latestTabs.current.find(item=>item.path===path);
    if(!tab||tab.readonly||(readonly&&!tab.untitled))return;
    setTabs(prev=>prev.map(item=>item.path===path?{...item,value,status:item.untitled?'modified':item.status}:item));
    if(!tab.untitled)queue.edit(path,value);
  };
  const save=useCallback(async(path:string,force=false)=>{
    const tab=latestTabs.current.find(item=>item.path===path);
    if(!tab||tab.readonly)return;
    if(tab.untitled){
      setPathInput(tab.targetDirectory?tab.targetDirectory+'/':'');
      setDialogError('');
      setModal('saveAs');
      return;
    }
    if(readonly)return;
    if(workspace.validate){
      try{
        const diagnostics=await workspace.validate(path,tab.value);
        setTabs(prev=>prev.map(item=>item.path===path?{...item,diagnostics}:item));
        if(diagnostics.some(d=>d.severity==='error'&&d.blocksSave)){
          setPanel('Problems');setProblemsOpen(true);setMessage('Resolve the blocking problems before saving.');return;
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
      if(k==='n'&&!e.shiftKey){e.preventDefault();createUntitled();}
      if(k==='p'){e.preventDefault();setPaletteMode(e.shiftKey?'command':'file');setPaletteQuery('');}
      if(k==='f'&&e.shiftKey){e.preventDefault();setPanel('Search');}
    };
    window.addEventListener('keydown',keydown);
    return()=>window.removeEventListener('keydown',keydown);
  },[save]);

  useEffect(()=>()=>{latestTabs.current.forEach(tab=>tab.preview?.release?.());},[]);
  const closeTab=(path:string)=>{
    const tab=latestTabs.current.find(t=>t.path===path);
    if(tab?.status!=='saved'){setMessage('Save this file before closing. Unsaved edits remain in the buffer.');return;}
    tab?.preview?.release?.();
    setTabs(prev=>prev.filter(t=>t.path!==path));
    if(latestActive.current===path)setActive(latestTabs.current.find(t=>t.path!==path)?.path||'');
  };
  const reload=async()=>{
    if(!current||current.untitled)return;
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
    if(!current||current.untitled)return;
    try{
      const result=await workspace.restore(current.path,rev.id,current.version);
      if(!result.ok){setMessage(result.message);return;}
      queue.discardDraft(current.path,result.file.version);
      setTabs(prev=>prev.map(t=>t.path===current.path?{...result.file,value:result.file.content,status:'saved',diagnostics:[],editorDiagnostics:[]}:t));
      setMessage('Revision restored.');setHistory(await workspace.history(current.path));
    }catch(e){setMessage(String(e));}
  };
  const create=async()=>{
    setDialogError('');
    if(modal==='saveAs'){
      const draft=latestTabs.current.find(item=>item.path===latestActive.current);
      if(!draft?.untitled){setModal(null);return;}
      setSavingDraft(true);
      try{
        const saved=await createWorkspaceTextFile(workspace,pathInput,draft.value);
        const originalPath=draft.path;
        queue.acceptDiskVersion(saved.path,saved.version);
        setTabs(prev=>prev.map(item=>item.path===originalPath?
          {...saved,value:saved.content,status:'saved',diagnostics:[],editorDiagnostics:[],
            language:saved.language||languageIdFromPath(saved.path),untitled:false} : item));
        setActive(saved.path);
        setExpanded(prev=>new Set([...prev,...workspaceParents(saved.path)]));
        setModal(null);
        setPathInput('');
        setMessage('File created and saved: '+saved.path);
        await refresh();
      }catch(error){
        // Never discard the untitled buffer when a provider denies or fails a write.
        setDialogError(error instanceof Error?error.message:String(error));
      }finally{setSavingDraft(false);}
      return;
    }
    if(readonly||(modal==='rename'?!canRename:!canCreate)){
      setDialogError('This filesystem source does not support that operation.');return;
    }
    try{
      const path=normalizeWorkspacePath(pathInput,modal==='folder'?'folder':'file');
      if(modal==='rename'&&current&&!current.untitled){
        if(current.status!=='saved')throw Error('Save before renaming.');
        await workspace.rename(current.path,path);closeTab(current.path);await open(path);
      }else if(modal==='folder'){
        await workspace.create(path,'folder');
      }
      setModal(null);setPathInput('');await refresh();
    }catch(error){setDialogError(error instanceof Error?error.message:String(error));}
  };
  const remove=async()=>{
    if(!canDelete||!current||current.untitled||current.status!=='saved')return;
    try{await workspace.delete(current.path,current.version);closeTab(current.path);await refresh();}
    catch(error){setMessage(error instanceof Error?error.message:String(error));}
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
    {name:'New file',run:()=>createUntitled()},
    ...(canCreate?[{name:'New folder',run:()=>{setModal('folder');setPathInput('');setDialogError('');}}]:[]),
    ...(canSearch?[{name:'Find in files',run:()=>setPanel('Search')}]:[]),
    ...(canHistory?[{name:'Timeline',run:()=>void showHistory()}]:[]),
    {name:'Refresh',run:()=>void refresh()},
    ...(showHostModes&&canChanges?[{name:'Changes',run:()=>void showChanges()}]:[]),
    ...(showHostModes&&canSnapshot?[{name:'Merkle snapshot',run:()=>void showSnapshot()}]:[]),
    {name:'Editor appearance',run:()=>setAppearanceOpen(true)},
    {name:'Split editor',run:()=>setSplit(!split)},
    {name:'Toggle explorer',run:()=>setExplorerOpen(value=>!value)},
  ];
  const paletteEntries=paletteMode==='file'
    ? tree.filter(entry=>entry.kind==='file'&&entry.path.toLowerCase().includes(paletteQuery.toLowerCase()))
      .map(entry=>({name:entry.path,run:()=>void open(entry.path)}))
    : commands.filter(command=>command.name.toLowerCase().includes(paletteQuery.toLowerCase()));
  const runPaletteEntry=(index:number)=>{
    const item=paletteEntries[index];
    if(!item)return;
    setPaletteMode(null);
    setPaletteSelection(0);
    item.run();
  };
  const rendered=(tab:Tab)=><AgentSamMonacoEditor document={{workspaceId,path:tab.path,text:tab.value,languageId:tab.language}}
    onChange={value=>edit(tab.path,value)} onSave={()=>save(tab.path)} palette={palette} readOnly={Boolean((readonly&&!tab.untitled)||tab.readonly)}
    onEditorReady={editor=>{if(tab.untitled)editor.focus();}}
    onDiagnostics={markers=>setTabs(prev=>prev.map(item=>item.path===tab.path?{...item,editorDiagnostics:markers.map(marker=>({
      path:tab.path,message:marker.message,severity:marker.severity>=8?'error':marker.severity>=4?'warning':'info',
      line:marker.startLineNumber,column:marker.startColumn,
    }))}:item))}
    revealPosition={revealRequest?.path===tab.path?revealRequest:undefined}
    savedVersion={tab.version} lsp={lsp} onNavigate={onNavigate} onApplyWorkspaceEdit={onApplyWorkspaceEdit} onSelectionChange={s=>setCursor({line:s.startLine,column:s.startColumn})}
    options={{fontFamily:EDITOR_FONTS.find(font=>font.id===appearance.fontId)!.family,fontSize:appearance.fontSize,
      minimap:{enabled:appearance.minimap},wordWrap:appearance.wordWrap?'on':'off'}} height="100%"/>;
  const previewed=(tab:Tab)=>{
    if(tab.preview){
      const preview=tab.preview;
      return <div className="asi-media-preview">
        {preview.kind==='image'?<img src={preview.url} alt={tab.path} />:null}
        {preview.kind==='video'?<video src={preview.url} controls preload="metadata" />:null}
        {preview.kind==='audio'?<audio src={preview.url} controls preload="metadata" />:null}
        {preview.kind==='pdf'?<iframe src={preview.url} title={tab.path} />:null}
        {preview.kind==='binary'?<p>Binary asset cannot be edited as text.</p>:null}
      </div>;
    }
    if(isMarkdownPath(tab.path))return <article className="asi-document-preview">{renderMarkdown?renderMarkdown(tab.value):<pre>{tab.value}</pre>}</article>;
    if(isHtmlPath(tab.path))return <iframe className="asi-html-preview" title={tab.path+' preview'} sandbox="" srcDoc={tab.value}/>;
    return rendered(tab);
  };
  // Host validators and Monaco/LSP markers are authoritative; never invent CLI errors.
  useEffect(()=>{
    if(!workspace.validate||!current||current.preview||current.untitled)return;
    const path=current.path;
    const content=current.value;
    let live=true;
    const timeout=setTimeout(()=>{
      void workspace.validate!(path,content).then(diagnostics=>{
        if(live)setTabs(prev=>prev.map(tab=>tab.path===path&&tab.value===content?{...tab,diagnostics}:tab));
      }).catch(()=>{ /* A disconnected validator is not a fabricated problem. */ });
    },650);
    return ()=>{live=false;clearTimeout(timeout);};
  },[workspace,current?.path,current?.value]);
  const availablePanels:Panel[]=['Explorer',...(canSearch?['Search' as const]:[]),...(canHistory?['Timeline' as const]:[]),'Problems',
    ...(showHostModes&&canChanges?['Changes' as const]:[]),
    ...(showHostModes&&canSnapshot?['Snapshot' as const]:[]),...(workspace.configuration?.references?.length?['References' as const]:[]),...(workspace.configuration?.dependencies?.length?['Dependencies' as const]:[])];
  const problems=tabs.flatMap(tab=>[...tab.diagnostics,...tab.editorDiagnostics].map(item=>({...item,path:tab.path})));
  const goToProblem=(problem:WorkspaceDiagnostic)=>{
    setRevealRequest(previous=>({path:problem.path,line:problem.line||1,column:problem.column||1,requestId:(previous?.requestId||0)+1}));
    void open(problem.path);
    setPanel('Problems');
  };
  useEffect(() => {
    onActiveFileChange?.(current ? {path:current.path,version:current.version} : null);
  }, [onActiveFileChange, current?.path, current?.version]);
  const dirty=current&&current.status!=='saved';
  return <div className="asi-ide">
    <header className="asi-toolbar">
      <div className="asi-toolbar-identity"><span className="asi-toolbar-kicker">FILES / EDITOR</span><strong title={label}>{label}</strong></div>
      <nav aria-label="Editor actions">
        <button className="asi-action-primary" type="button" aria-label="New file" title="New file (⌘N / Ctrl+N)" onClick={()=>createUntitled()}>＋ New file</button>
        <button type="button" aria-pressed={explorerOpen} onClick={()=>setExplorerOpen(value=>!value)}>{explorerOpen?'Hide files':'Show files'}</button>
        <button type="button" onClick={()=>setPaletteMode('file')}>Open file</button>
        <button type="button" onClick={()=>{setPaletteMode('command');setPaletteQuery('');}}>Commands</button>
        <button type="button" disabled={!current} onClick={()=>{setSplit(!split);setPreviewOnly(false);}}>{split?'Close split':'Split'}</button>
        <button type="button" disabled={!current||(!current.preview&&!isMarkdownPath(current.path)&&!isHtmlPath(current.path))}
          onClick={()=>{setPreviewOnly(!previewOnly);setSplit(false);}}>{previewOnly?'Source':'Preview'}</button>
        <button type="button" disabled={!current||!canHistory} onClick={()=>void showHistory()}>History</button>
        <button type="button" aria-label="Editor appearance" aria-expanded={appearanceOpen} onClick={()=>setAppearanceOpen(value=>!value)}>Font</button>
        <button type="button" disabled={!current||current.readonly||(readonly&&!current.untitled)} onClick={()=>current&&void save(current.path)}>{current?.status==='saving'?'Saving…':'Save'}</button>
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
    <div className={'asi-main'+(explorerOpen?'':' asi-explorer-collapsed')}
      style={{'--asi-sidebar-width':sidebarWidth+'px'} as CSSProperties}>
      <aside className="asi-aside" aria-label="Editor sidebar">
        {sources?.length ? <WorkspaceSourceRail sources={sources} sourceId={sourceId} onSelect={onSourceSelect} /> : null}
        <nav className="asi-sidebar-nav">{availablePanels.map(name=><button type="button" aria-current={panel===name} key={name} onClick={()=>name==='Timeline'?void showHistory():name==='Changes'?void showChanges():name==='Snapshot'?void showSnapshot():setPanel(name)}>{name}</button>)}</nav>
        <div className="asi-side-content">
          {panel==='Explorer'&&connectionPanel?<div className="asi-source-connect">
            <p>A file source is not attached.</p>
            <button type="button" onClick={()=>setSourceSettingsOpen(true)}>Connect or manage source</button>
          </div>:null}
          {panel==='Explorer'&&<><div className="asi-side-header"><strong>Explorer</strong><div><button type="button" aria-label="New file" title="Create untitled file" onClick={()=>createUntitled()}>＋</button><button type="button" disabled={!canCreate} aria-label="New folder" onClick={()=>{setModal('folder');setPathInput('');}}>▣</button><button type="button" aria-label="Refresh files" onClick={()=>void refresh()}>↻</button></div></div>
            {treeError&&<div className="asi-reconnect" role="alert"><strong>Files unavailable</strong><p>{treeError}</p><div>{onReconnect&&<button type="button" onClick={onReconnect}>Reconnect workspace</button>}{onConnectionSettings&&<button type="button" onClick={onConnectionSettings}>Runtime settings</button>}<button type="button" onClick={()=>void refresh()}>Retry files</button></div></div>}
            <WorkspaceTreeView entries={visibleTree} expanded={expanded} active={active}
              onFile={path=>void open(path)} onFolder={path=>void toggleFolder(path)}
              onMenu={(entry,point)=>setContextMenu({path:entry.path,x:Math.max(8,Math.min(point.x,window.innerWidth-220)),y:Math.max(8,Math.min(point.y,window.innerHeight-230))})}/></>}
          {panel==='Search'&&<><div className="asi-side-header"><strong>Find in files</strong></div><form className="asi-search" onSubmit={e=>{e.preventDefault();void find();}}><input value={query} aria-label="Search workspace" onChange={e=>setQuery(e.target.value)}/><button type="submit">Find</button></form>{hits.map((hit,i)=><button key={i} className="asi-hit" type="button" onClick={()=>void open(hit.path)}><strong>{hit.path}:{hit.line}</strong><span>{hit.preview}</span></button>)}</>}
          {panel==='Timeline'&&<><div className="asi-side-header"><strong>Timeline</strong></div>{history.map(rev=><div key={rev.id} className="asi-revision"><span>{rev.label||rev.createdAt}</span><button type="button" onClick={()=>setConfirmation({kind:'restore',revision:rev})}>Restore</button></div>)}</>}
          {panel==='Problems'&&<><div className="asi-side-header"><strong>Problems · {problems.length}</strong></div>{problems.map((problem,i)=><button key={i} className="asi-hit" type="button" onClick={()=>goToProblem(problem)}>{problem.severity}: {problem.path} — {problem.message}</button>)}</>}
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
      <div className="asi-grabbar" role="separator" aria-label="Resize file explorer" aria-orientation="vertical" tabIndex={0}
        onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);}}
        onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.parentElement?.getBoundingClientRect();if(rect)setSidebarWidth(Math.min(Math.max(150,event.clientX-rect.left),Math.max(150,rect.width-210)));}}
        onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
        onDoubleClick={()=>setSidebarWidth(235)}
        onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setSidebarWidth(value=>Math.max(150,Math.min(450,value+(event.key==='ArrowLeft'?-16:16))));}}}/>
      <section className="asi-center" aria-label="Code editor">
        <div className="asi-tabs" role="tablist">{tabs.map(tab=><div key={tab.path} role="tab" aria-selected={active===tab.path}><button type="button" onClick={()=>setActive(tab.path)}>{tab.displayName||tab.path.split('/').at(-1)}{tab.status!=='saved'?' ●':''}</button><button type="button" aria-label={'Close '+tab.path} onClick={()=>closeTab(tab.path)}>×</button></div>)}</div>
        {current?<><div className="asi-breadcrumb"><span>{current.untitled?'Unsaved draft / '+current.displayName:current.displayName||current.path.split('/').join(' › ')}</span><div><button type="button" onClick={()=>{setModal('rename');setPathInput(current.path);}} disabled={Boolean(current.untitled)||!canRename||Boolean(dirty)||current.canRename===false}>Rename</button><button type="button" onClick={()=>setConfirmation({kind:'delete'})} disabled={Boolean(current.untitled)||!canDelete||Boolean(dirty)||current.canDelete===false}>Delete</button></div></div>
        <div className={'asi-editors'+(split&&!current.preview?' asi-split':'')}
          style={{'--asi-split-editor':splitPercent+'fr','--asi-split-preview':(100-splitPercent)+'fr'} as CSSProperties}>
          {!current.preview&&(!previewOnly||split)?<div>{rendered(current)}</div>:null}
          {split&&!current.preview&&<div className="asi-grabbar asi-grabbar--preview" role="separator" aria-label="Resize source and preview" aria-orientation="vertical" tabIndex={0}
            onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);}}
            onPointerMove={event=>{if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const rect=event.currentTarget.parentElement?.getBoundingClientRect();if(rect)setSplitPercent(Math.max(20,Math.min(80,100*(event.clientX-rect.left)/rect.width)));}}
            onPointerUp={event=>{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
            onDoubleClick={()=>setSplitPercent(50)}
            onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setSplitPercent(value=>Math.max(20,Math.min(80,value+(event.key==='ArrowLeft'?-5:5))));}}}/>}
          {(current.preview||previewOnly||split)?<div>{previewed(current)}</div>:null}
        </div>
        {current.status==='conflict'&&<div className="asi-alert" role="alert"><strong>File changed elsewhere. Your edits are preserved.</strong><button type="button" onClick={()=>void reload()}>Reload theirs</button><button type="button" onClick={()=>{setConfirmation({kind:'overwrite'});}}>Overwrite</button><button type="button" onClick={async()=>{try{setTheirs((await workspace.read(current.path)).content);}catch(e){setMessage(String(e));}}}>Compare</button></div>}
        {current.status==='error'&&<div className="asi-alert" role="alert"><strong>Save failed. Your changes remain available.</strong><button type="button" onClick={()=>void save(current.path)}>Retry</button></div>}
        {theirs!==null&&<div className="asi-diff"><div><strong>Saved version</strong><pre>{theirs}</pre></div><div><strong>Your changes</strong><pre>{current.value}</pre></div><button type="button" onClick={()=>setTheirs(null)}>Close comparison</button></div>}
        {proposal?.path===current.path&&<div className="asi-alert"><strong>{proposal.explanation}</strong><button type="button" onClick={()=>{edit(current.path,proposal.content);setProposal(null);}}>Apply patch to buffer</button><button type="button" onClick={()=>setProposal(null)}>Discard</button></div>}
        </>:<div className="asi-welcome"><div className="asi-empty-workspace">
          <div className="asi-empty-icon" aria-hidden="true">⌘</div>
          <h2>Your editor is ready</h2>
          <p>Write a new file or open one from your connected sources. Drafts don't touch the filesystem until you save them.</p>
          <div className="asi-empty-actions">
            <button type="button" className="asi-action-primary" onClick={()=>createUntitled()}>＋ New file</button>
            <button type="button" onClick={()=>{setPaletteMode('file');setPaletteQuery('');}}>Open file</button>
          </div>
          <small>⌘N New file · ⌘P Open file · ⌘⇧P Commands</small>
        </div>
        {connectionPanel?<div className="asi-connection-empty">{connectionPanel}</div>:null}
        </div>}
      </section>
    </div>
    {contextMenu&&menuEntry&&<><button type="button" className="asi-context-dismiss" aria-label="Dismiss file menu" onClick={()=>setContextMenu(null)}/>
      <div role="menu" aria-label={"File actions for "+menuEntry.path} className="asi-context-menu"
        style={{left:contextMenu.x,top:contextMenu.y}} onKeyDown={event=>{if(event.key==='Escape')setContextMenu(null)}}>
        <div className="asi-context-title">{menuEntry.path.split('/').at(-1)}</div>
        <button type="button" role="menuitem" onClick={()=>{const target=menuEntry;setContextMenu(null);void (target.kind==='folder'?toggleFolder(target.path):open(target.path));}}>{menuEntry.kind==='folder'?'Toggle folder':'Open file'}</button>
        <button type="button" role="menuitem" onClick={()=>{void navigator.clipboard?.writeText(menuEntry.path).then(()=>setMessage('Copied workspace-relative path.')).catch(()=>setMessage('Clipboard permission unavailable.'));setContextMenu(null);}}>Copy relative path</button>
        {<>
          <div className="asi-context-separator"/>
          <button type="button" role="menuitem" onClick={()=>{const parent=menuEntry.kind==='folder'?menuEntry.path:workspaceParents(menuEntry.path).at(-1)||'';setContextMenu(null);createUntitled(parent);}}>New file here</button>
          <button type="button" role="menuitem" disabled={!canCreate} onClick={()=>{const parent=menuEntry.kind==='folder'?menuEntry.path:workspaceParents(menuEntry.path).at(-1)||'';setContextMenu(null);setModal('folder');setDialogError('');setPathInput(parent?parent+'/':'');}}>New folder here</button>
          {menuEntry.kind==='file'&&current?.path===menuEntry.path&&current.status==='saved'&&<>
            <div className="asi-context-separator"/>
            <button type="button" role="menuitem" disabled={!canRename||current.canRename===false} onClick={()=>{setContextMenu(null);setModal('rename');setPathInput(menuEntry.path);}}>Rename selected file</button>
            <button type="button" role="menuitem" disabled={!canDelete||current.canDelete===false} onClick={()=>{setContextMenu(null);setConfirmation({kind:'delete'});}}>Delete selected file…</button>
          </>}
        </>}
      </div>
    </>}
    {problemsOpen&&<section className="asi-problems-dock" aria-label="Problems panel">
      <header><strong>Problems · {problems.length}</strong><button type="button" onClick={()=>setProblemsOpen(false)} aria-label="Close Problems panel">×</button></header>
      <div className="asi-problems-list">
        {problems.length===0?<p>No diagnostics reported for open files. Monaco/LSP and host validators populate this view when available.</p>:
          problems.map((problem,i)=><button type="button" className="asi-problem-row" key={problem.path+String(i)+problem.message}
            onClick={()=>goToProblem(problem)}>
            <span data-severity={problem.severity}>{problem.severity}</span>
            <span className="asi-problem-path">{problem.path}{problem.line?':'+problem.line+(problem.column?':'+problem.column:''):''}</span>
            <span>{problem.message}</span>
          </button>)}
      </div>
    </section>}
    {agent&&current&&<div className="asi-agent"><button type="button" disabled={agentBusy} onClick={()=>void ask()}>{agentBusy?'Preparing proposal…':'Work with '+agent.label}</button></div>}
    <footer className="asi-status"><span>{label}</span><span>{current?.status||''}</span><span>Ln {cursor.line}, Col {cursor.column}</span><span>{current?.eol||'LF'}</span><span>{current?.encoding||'UTF-8'}</span><span>{current?.language||'Text'}</span><button type="button" aria-expanded={problemsOpen} onClick={()=>{setPanel('Problems');setProblemsOpen(value=>!value);}}>{problems.length} problems</button></footer>
    {message&&<div className="asi-message" role="status">{message}<button type="button" onClick={()=>setMessage('')}>×</button></div>}
    {modal&&<div className="asi-overlay"><form className="asi-dialog" role="dialog" aria-modal="true" aria-labelledby="asi-dialog-title" onSubmit={e=>{e.preventDefault();void create();}}>
      <div className="asi-dialog-heading"><span className="asi-dialog-symbol" aria-hidden="true">⌁</span><div>
        <strong id="asi-dialog-title">{modal==='saveAs'?'Save untitled file':modal==='rename'?'Rename file':'New folder'}</strong>
        <p>{modal==='saveAs'?'Choose a path within the currently authorized file source. Existing files are never overwritten.':'Choose a workspace-relative path.'}</p>
      </div></div>
      <label className="asi-field-label" htmlFor="asi-path-field">File path</label>
      <input id="asi-path-field" autoFocus value={pathInput} aria-label="Workspace path" onChange={e=>{setPathInput(e.target.value);setDialogError('');}} placeholder={modal==='saveAs'?'src/untitled.ts':'folder/name'} />
      {modal==='saveAs'&&<p className="asi-source-hint">Destination: {label} · {canCreate?'Authorized adapter':'Choose a writable source to save'}</p>}
      {dialogError&&<p className="asi-field-error" role="alert">{dialogError}</p>}
      <div className="asi-dialog-actions"><button type="button" onClick={()=>{setModal(null);setDialogError('');}}>Cancel</button><button className="asi-action-primary" type="submit" disabled={savingDraft||!pathInput.trim()}>{savingDraft?'Saving…':modal==='saveAs'?'Create & save':'Confirm'}</button></div>
    </form></div>}
    {sourceSettingsOpen&&connectionPanel&&<div className="asi-overlay">
      <section className="asi-dialog asi-connection-dialog" role="dialog" aria-modal="true" aria-label="File source connections">
        {connectionPanel}
        <div className="asi-dialog-actions"><button type="button" onClick={()=>setSourceSettingsOpen(false)}>Close</button></div>
      </section>
    </div>}
    {confirmation&&<div className="asi-overlay"><section className="asi-dialog" role="alertdialog" aria-modal="true" aria-label="Confirm file action">
      <strong>{confirmation.kind==='delete'?'Delete this file?':confirmation.kind==='overwrite'?'Overwrite newer content?':'Restore revision?'}</strong>
      <p>{confirmation.kind==='delete'?'This removes the selected file from its authorized source.':confirmation.kind==='overwrite'?'The version on disk has changed. An overwrite may replace another writer’s changes.':'The selected saved revision will replace the current file content.'}</p>
      <div className="asi-dialog-actions"><button type="button" onClick={()=>setConfirmation(null)}>Cancel</button><button className="asi-action-primary" type="button" onClick={()=>{const choice=confirmation;setConfirmation(null);if(choice.kind==='delete')void remove();else if(choice.kind==='restore'&&choice.revision)void restore(choice.revision);else if(choice.kind==='overwrite'&&current)void save(current.path,true);}}>Continue</button></div>
    </section></div>}
    {paletteMode&&<div className="asi-overlay"><div className="asi-dialog asi-command-dialog" role="dialog" aria-modal="true" aria-label={paletteMode==='file'?'Go to file':'Command palette'}>
      <div className="asi-command-field"><span aria-hidden="true">⌕</span>
      <input autoFocus aria-label="Command palette" value={paletteQuery}
        onKeyDown={event=>{
          if(event.key==='Escape')setPaletteMode(null);
          if(event.key==='ArrowDown'){event.preventDefault();setPaletteSelection(index=>Math.min(index+1,paletteEntries.length-1));}
          if(event.key==='ArrowUp'){event.preventDefault();setPaletteSelection(index=>Math.max(0,index-1));}
          if(event.key==='Enter'){event.preventDefault();runPaletteEntry(Math.max(0,Math.min(paletteSelection,paletteEntries.length-1)));}
        }}
        onChange={event=>{setPaletteQuery(event.target.value);setPaletteSelection(0);}}
        placeholder={paletteMode==='file'?'Go to file…':'Run command…'} />
      </div>
      <div className="asi-palette-results" role="listbox">
        {paletteEntries.length===0?<p className="asi-command-empty">No matching {paletteMode==='file'?'files':'commands'}.</p>:
          paletteEntries.map((item,index)=><button key={item.name} role="option" aria-selected={index===paletteSelection}
            type="button" onMouseEnter={()=>setPaletteSelection(index)} onClick={()=>runPaletteEntry(index)}>{item.name}</button>)}
      </div>
      <div className="asi-command-footer"><span>↑ ↓ Navigate · ↵ Select · Esc Close</span>
        <button type="button" onClick={()=>setPaletteMode(null)}>Close</button></div>
    </div></div>}
  </div>;
}
