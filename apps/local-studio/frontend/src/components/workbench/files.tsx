/**
 * Side Stage Files is a host of the shared @inneranimalmedia/agentsam-ide UI.
 * It must not maintain a second explorer/Monaco implementation.
 */
import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, RefreshCw, Settings2 } from 'lucide-react';
import { AgentSamFilesystem, type AgentSamFilesystemSource, type AgentSamFilesystemContext, type IDEFileSource, type IDEFileSourceId } from '@inneranimalmedia/agentsam-ide/surface';
import type { AgentSamEditorPalette } from '@inneranimalmedia/agentsam-ide/monaco';
import { HttpLspTransport, workspaceRootFileUri } from '@inneranimalmedia/agentsam-ide/lsp';
import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { NativeLspTransport } from '@/lib/desktop/native-lsp';
import { readTheme, type StoredTheme } from '@/lib/work/theme';
import '@inneranimalmedia/agentsam-ide/surface/workspace-editor.css';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const renderIDEWorkspaceMarkdown = (content:string) => <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>;
import { useActiveProject, useWorkStore } from '@/lib/work/store';
import { isAuthorizedHostProject, isSampleProject, projectNeedsConnection } from '@/lib/work/workspace-restore';
import { createRuntimeIDEWorkspace, createTutorialIDEWorkspace } from '@/lib/work/ide-workspace';
import { browserFsaAvailable, chooseBrowserFsaIDEWorkspace, restoreBrowserFsaIDEWorkspace, reconnectBrowserFsaIDEWorkspace, type FileWorkspace, type BrowserFsaRestore } from '@inneranimalmedia/agentsam-ide/workspace';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { WorkspaceGate } from '@/components/workbench/workspace-gate';
import { NewTabStage } from '@/components/workbench/new-tab-stage';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RemoteFilesSource } from '@/components/workbench/remote-files-source';
import type { SideTab } from '@inneranimalmedia/agentsam-local-shared';
import { createChatFileWorkspace } from '@/lib/work/chat-file-workspace';

const descriptions: Record<IDEFileSourceId, string> = {
  local: 'Local runtime — requires an authorized root and capability',
  github: 'GitHub — requires an authorized repository connection',
  r2: 'Cloudflare R2 — requires an account-scoped storage binding',
  drive: 'Google Drive — requires OAuth and an authorized folder',
  container: 'Cloudflare container — requires an authorized sandbox session',
  docker: 'Docker — requires an authorized host Docker engine',
};

export function FilesStage({ tab }: { tab: SideTab }) {
  const project = useActiveProject();
  const { user, isPending: identityPending } = useCurrentUserState();
  const browserScope = !identityPending && user?.id ? user.id : '';
  const projects = useWorkStore(state => state.projects);
  const selectProject = useWorkStore(state => state.setActiveProject);
  const [connectOpen, setConnectOpen] = useState(false);
  const openRuntimeSettings = () => window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: '/admin/settings/runtime' } }));
  const rememberedProjects = projects.filter(item => item.kind === 'filesystem' && !isSampleProject(item) && (item.workspaceRoot || item.name));
  const [source,setSource] = useState<IDEFileSourceId>(() => {
    if(typeof window==='undefined')return 'local';
    try {
      const saved=window.sessionStorage.getItem('agentsam:ide:source');
      return (['local','github','r2','drive','container','docker'] as string[]).includes(saved||'')
        ? saved as IDEFileSourceId : 'local';
    } catch { return 'local'; }
  });
  // OAuth returns to this route; preserve the requested source in this tab.
  useEffect(()=>{try{window.sessionStorage.setItem('agentsam:ide:source',source);}catch{}},[source]);
  const [browserWorkspace,setBrowserWorkspace] = useState<FileWorkspace|null>(null);
  const [browserWorkspaceName,setBrowserWorkspaceName] = useState('');
  const [browserResumeHint,setBrowserResumeHint] = useState<BrowserFsaRestore|null>(null);
  const [browserWorkspaceKey,setBrowserWorkspaceKey] = useState('');
  const [browserFsaReady,setBrowserFsaReady] = useState(false);
  useEffect(()=>setBrowserFsaReady(!isPackagedDesktop()&&browserFsaAvailable()),[]);
  const [sourceNotice, setSourceNotice] = useState('');
  const [monacoReady,setMonacoReady]=useState(false);
  const [monacoFailure,setMonacoFailure]=useState('');
  useEffect(()=>{
    let live=true;
    if(!import.meta.env.SSR) {
      void import('./monaco-runtime').then(()=>{if(live)setMonacoReady(true);})
        .catch(error=>{if(live)setMonacoFailure(error instanceof Error?error.message:String(error));});
    }
    return ()=>{live=false;};
  },[]);
  const [theme,setTheme]=useState<StoredTheme>(readTheme);
  useEffect(()=>{
    const update=(event:Event)=>setTheme((event as CustomEvent<StoredTheme>).detail ?? readTheme());
    window.addEventListener('agentsam:theme',update);
    return ()=>window.removeEventListener('agentsam:theme',update);
  },[]);
  const palette = useMemo<AgentSamEditorPalette>(()=>({
    base:theme.monacoBase,
    background:theme.tokens.background,
    foreground:theme.tokens.foreground,
    panel:theme.tokens.card,
    border:theme.tokens.border,
    muted:theme.tokens.clay,
    accent:theme.tokens.ring,
    comment:theme.tokens.clay,
    string:theme.tokens.stone,
    keyword:theme.tokens.foreground,
  }),[theme]);
  const ready = Boolean(project && (isAuthorizedHostProject(project) || isSampleProject(project)));
  // Browser permissions are device-local and user-scoped. Query on mount; prompt only
  // when the user clicks Reconnect, never in an effect or across account changes.
  useEffect(()=>{
    setBrowserWorkspace(null);setBrowserWorkspaceName('');setBrowserResumeHint(null);
  },[browserScope]);
  useEffect(()=>{
    if(!browserFsaReady||!browserScope||ready)return;
    let active=true;
    void restoreBrowserFsaIDEWorkspace(browserScope).then(restored=>{
      if(!active||!restored)return;
      if(restored.workspace){
        setBrowserWorkspace(restored.workspace);setBrowserWorkspaceName(restored.name);
        setBrowserWorkspaceKey(crypto.randomUUID());
        setBrowserResumeHint(null);
      }else setBrowserResumeHint(restored);
    }).catch(()=>{});
    return ()=>{active=false;};
  },[browserFsaReady,browserScope,ready]);
  // A successful connection closes the opt-in connect dialog.
  useEffect(()=>{ if(ready) setConnectOpen(false); },[ready,project?.id]);
  const workspace = useMemo(() => {
    if (!project || !ready) return null;
    if (project.kind === 'filesystem' && project.runtimeBaseUrl)
      return createRuntimeIDEWorkspace(project.runtimeBaseUrl, project.runtimeCapability);
    return createTutorialIDEWorkspace(project.id);
  }, [project?.id, project?.kind, project?.runtimeBaseUrl, project?.runtimeCapability, ready]);
  const lsp = useMemo(()=>{
    if(!project || project.kind!=='filesystem' || !ready || !project.workspaceRoot)return undefined;
    const workspaceRootUri=workspaceRootFileUri(project.workspaceRoot);
    if(isPackagedDesktop())return {transport:new NativeLspTransport(project.workspaceRoot),workspaceRootUri};
    if(project.runtimeBaseUrl && project.runtimeCapability)
      return {transport:new HttpLspTransport(project.runtimeBaseUrl,project.runtimeCapability),workspaceRootUri};
    return undefined;
  },[project?.id,project?.kind,project?.workspaceRoot,project?.runtimeBaseUrl,project?.runtimeCapability,ready]);
  const sources = useMemo<IDEFileSource[]>(() => ([
    { id:'local', label:'Local', state: browserWorkspace || (project?.kind === 'filesystem' && ready) ? 'connected' : project && isSampleProject(project) ? 'sample' : 'disconnected', detail:browserWorkspace?'User-authorized browser folder (manual save; no PTY/LSP)':descriptions.local },
    { id:'github', label:'GitHub', state:'disconnected', detail:descriptions.github },
    { id:'r2', label:'Cloudflare R2', state:'disconnected', detail:descriptions.r2 },
    { id:'drive', label:'Google Drive', state:'disconnected', detail:descriptions.drive },
    { id:'container', label:'Cloudflare container', state:'disconnected', detail:descriptions.container },
    { id:'docker', label:'Docker', state:'disconnected', detail:descriptions.docker },
  ]), [project?.kind, ready, browserWorkspace]);

  const localSources: AgentSamFilesystemSource[] = sources.map(item => item.id === 'local' ? {
    ...item,
    workspace: browserWorkspace || workspace,
    workspaceId: browserWorkspace ? browserWorkspaceKey : project?.id,
    workspaceLabel: browserWorkspace ? browserWorkspaceName : project?.name,
    context: {root: browserWorkspace ? undefined : project?.workspaceRoot || undefined},
    reconnect: () => browserWorkspace ? void reconnectBrowserFolder() : setConnectOpen(true),
    manageConnection: openRuntimeSettings,
  } : item);
  const publishFilesystemContext = (context: AgentSamFilesystemContext) => {
    window.dispatchEvent(new CustomEvent('agentsam:filesystem-context', {detail:context}));
  };
  const attachmentWorkspace = useMemo(() =>
    tab.attachedResource && browserScope
      ? createChatFileWorkspace(tab.attachedResource,browserScope)
      : null,
    [tab.attachedResource?.blobId,tab.attachedResource?.name,tab.attachedResource?.size,
      tab.attachedResource?.mimeType,tab.attachedResource?.kind,browserScope]);

  async function openBrowserFolder() {
    setSourceNotice('');
    if(!browserScope){setSourceNotice('Sign in before connecting a browser folder.');return;}
    try {
      const result=await chooseBrowserFsaIDEWorkspace(browserScope);
      setBrowserWorkspace(result.workspace);
      setBrowserWorkspaceName(result.name);
      setBrowserResumeHint(null);
      setBrowserWorkspaceKey(crypto.randomUUID());
      setSource('local');
      setConnectOpen(false);
    } catch(error) {
      if(error instanceof Error && error.name==='AbortError')return;
      setSourceNotice(error instanceof Error?error.message:String(error));
    }
  }

  async function reconnectBrowserFolder(){
    if(!browserScope)return;
    setSourceNotice('');
    try{
      const result=await reconnectBrowserFsaIDEWorkspace(browserScope,browserResumeHint?.handle||null);
      setBrowserWorkspace(result.workspace);setBrowserWorkspaceName(result.name);
      setBrowserResumeHint(null);setBrowserWorkspaceKey(crypto.randomUUID());
      setSource('local');
    }catch(error){setSourceNotice(error instanceof Error?error.message:String(error));}
  }

  if (tab.attachedResource) {
    if (!attachmentWorkspace) return <p role="status" className="p-4 text-sm">Sign in to open this attachment.</p>;
    const { workspace:chatWorkspace, path } = attachmentWorkspace;
    return <AgentSamFilesystem
      sources={[{id:'local',label:'Conversation file',state:'connected',
        workspace:chatWorkspace,workspaceId:'chat:'+tab.attachedResource.blobId,workspaceLabel:tab.attachedResource.name}]}
      sourceId="local" onSourceSelect={setSource}
      initialFilePath={path} renderMarkdown={renderIDEWorkspaceMarkdown}
      palette={palette} onContextChange={publishFilesystemContext}/>;
  }
  if(source!=='local')return <RemoteFilesSource source={source} onSelect={setSource}
    palette={palette} hostConnected={Boolean(browserWorkspace||(project?.kind==='filesystem'&&ready))} />;
  const connectDialog = <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
    <DialogContent>
      <DialogTitle className="sr-only">Connect a project</DialogTitle>
      <DialogDescription className="sr-only">Connect an authorized project or open a folder.</DialogDescription>
      <WorkspaceGate project={project} force onOpenBrowserFolder={browserFsaReady?openBrowserFolder:undefined} />
    </DialogContent>
  </Dialog>;
  if(browserWorkspace) return <section className="work-files-stage flex h-full min-h-0 min-w-0 flex-col" aria-label="Authorized browser folder IDE">
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 text-xs">
      <strong className="truncate font-medium">Browser folder · {browserWorkspaceName}</strong>
      <span className="ml-auto truncate text-[10px] text-muted-foreground">Manual Save · Browser File System Access · No PTY/LSP</span>
      <button type="button" className="rounded-md border border-border px-2 py-1" onClick={()=>{setBrowserWorkspace(null);setBrowserWorkspaceName('');setConnectOpen(true);}}>Connect native host</button>
    </div>
    <div className="min-h-0 flex-1">
      {monacoFailure?<p role="alert" className="p-4 text-sm text-destructive">Monaco unavailable: {monacoFailure}</p>
        :!monacoReady?<p role="status" className="p-4 text-xs text-muted-foreground">Initializing Monaco…</p>
        :<AgentSamFilesystem renderMarkdown={renderIDEWorkspaceMarkdown}
            sources={localSources} sourceId="local" onSourceSelect={setSource}
            palette={palette} showHostModes onContextChange={publishFilesystemContext}/>}
    </div>
    {connectDialog}
  </section>;
  // No connection: the New tab is the default surface. The connector only appears on request.
  if (!project || projectNeedsConnection(project) || !ready)
    return <div className="h-full overflow-y-auto">
      <AgentSamFilesystem sources={localSources} sourceId="local" onSourceSelect={setSource}
        palette={palette} onContextChange={publishFilesystemContext} setup={<>
      {sourceNotice?<p role="alert" className="p-3 text-xs text-destructive">{sourceNotice}</p>:null}
      <section className="mx-3 mt-3 rounded-lg border border-border bg-card/50 p-3 text-xs" aria-label="Reconnect workspace files">
        <div className="flex items-center justify-between gap-2">
          <strong className="font-semibold">File tree</strong>
          <button className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted" type="button" onClick={openRuntimeSettings}>
            <Settings2 className="size-3" /> Runtime settings
          </button>
        </div>
        <p className="mt-1 text-muted-foreground">Previously opened projects remain identifiable here. Reauthorize a root before reading its files.</p>
        <div className="mt-3 flex flex-col gap-1.5">
          {rememberedProjects.map(saved=><div key={saved.id} className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 px-2 py-2">
            <FolderOpen className="size-4 shrink-0 text-muted-foreground"/>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" title={saved.name}>{saved.name}</div>
              {saved.workspaceRoot&&<div className="truncate font-mono text-[10px] text-muted-foreground" title={saved.workspaceRoot}>{saved.workspaceRoot}</div>}
            </div>
            <button className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 hover:bg-muted" type="button"
              onClick={()=>{selectProject(saved.id);setConnectOpen(true);}}><RefreshCw className="size-3"/>Reconnect</button>
          </div>)}
          {browserResumeHint&&<div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 px-2 py-2">
            <FolderOpen className="size-4 shrink-0 text-muted-foreground"/>
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{browserResumeHint.name}</div><div className="text-[10px] text-muted-foreground">Browser folder · authorization required</div></div>
            <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1.5 hover:bg-muted"
              onClick={()=>void reconnectBrowserFolder()}><RefreshCw className="size-3"/>Reconnect folder</button>
          </div>}
          {!rememberedProjects.length&&!browserResumeHint&&<button type="button" className="flex items-center gap-2 rounded-md border border-border px-2 py-2 text-left hover:bg-muted" onClick={()=>setConnectOpen(true)}>
            <FolderOpen className="size-4"/>Connect a local workspace</button>}
        </div>
      </section>
      <NewTabStage tab={tab} omitKinds={['files']} onConnectProject={()=>setConnectOpen(true)} onOpenFolder={browserFsaReady?openBrowserFolder:undefined} />
      </>} />
      {connectDialog}
    </div>;

  if (!workspace) return <p role="alert">No authorized workspace is available.</p>;
  if (monacoFailure) return <p role="alert" className="p-4 text-sm text-destructive">IDE runtime unavailable: {monacoFailure}</p>;
  if (!monacoReady) return <p role="status" className="p-4 text-sm text-muted-foreground">Initializing Monaco and language workers…</p>;
  return <section className="work-files-stage flex h-full min-h-0 min-w-0 flex-col" aria-label="AgentSam IDE Files">
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-sidebar/50 px-2 py-1.5 text-xs">
      <label htmlFor="asi-active-workspace" className="text-muted-foreground">Workspace</label>
      <select id="asi-active-workspace" className="min-w-0 max-w-[55%] rounded border border-border bg-background px-2 py-1"
        value={project.id} onChange={event=>{setSourceNotice('');selectProject(event.target.value);}}>
        {projects.filter(item=>isAuthorizedHostProject(item)||isSampleProject(item)).map(item=><option key={item.id} value={item.id}>{item.name}{isSampleProject(item)?' (tutorial)':''}</option>)}
      </select>
      <button className="rounded border border-border px-2 py-1" type="button" onClick={()=>setConnectOpen(true)}>Connect workspace</button>
      <span className="ml-auto truncate text-[10px] text-muted-foreground">{isSampleProject(project)?'Tutorial only':'Authorized host'}</span>
    </div>
    {sourceNotice ? <div role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">{sourceNotice}
      <button type="button" className="ml-3 underline" onClick={()=>setSourceNotice('')}>Dismiss</button></div> : null}
    <div className="min-h-0 flex-1">
      <AgentSamFilesystem renderMarkdown={renderIDEWorkspaceMarkdown}
        sources={localSources} sourceId="local" onSourceSelect={setSource}
        palette={palette} lsp={lsp} showHostModes onContextChange={publishFilesystemContext}/>
    </div>
    {connectDialog}
  </section>;
}
