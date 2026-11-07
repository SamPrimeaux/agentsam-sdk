/**
 * Side Stage Files is a host of the shared @inneranimalmedia/agentsam-ide UI.
 * It must not maintain a second explorer/Monaco implementation.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { WorkspaceSourceRail, type IDEFileSource, type IDEFileSourceId } from '@inneranimalmedia/agentsam-ide/surface';
import type { AgentSamEditorPalette } from '@inneranimalmedia/agentsam-ide/monaco';
import { HttpLspTransport, workspaceRootFileUri } from '@inneranimalmedia/agentsam-ide/lsp';
import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { NativeLspTransport } from '@/lib/desktop/native-lsp';
import { readTheme, type StoredTheme } from '@/lib/work/theme';
const WorkspaceEditor = lazy(()=>import('@inneranimalmedia/agentsam-ide/surface').then(mod=>({default:mod.WorkspaceEditor})));
import '@inneranimalmedia/agentsam-ide/surface/workspace-editor.css';
import { useActiveProject, useWorkStore } from '@/lib/work/store';
import { isAuthorizedHostProject, isSampleProject, projectNeedsConnection } from '@/lib/work/workspace-restore';
import { createRuntimeIDEWorkspace, createTutorialIDEWorkspace } from '@/lib/work/ide-workspace';
import { WorkspaceGate } from '@/components/workbench/workspace-gate';
import { RemoteFilesSource } from '@/components/workbench/remote-files-source';
import type { SideTab } from '@inneranimalmedia/agentsam-local-shared';

const descriptions: Record<IDEFileSourceId, string> = {
  local: 'Local runtime — requires an authorized root and capability',
  github: 'GitHub — requires an authorized repository connection',
  r2: 'Cloudflare R2 — requires an account-scoped storage binding',
  drive: 'Google Drive — requires OAuth and an authorized folder',
  container: 'Cloudflare container — requires an authorized sandbox session',
  docker: 'Docker — requires an authorized host Docker engine',
};

export function FilesStage({ tab: _tab }: { tab: SideTab }) {
  const project = useActiveProject();
  const projects = useWorkStore(state => state.projects);
  const selectProject = useWorkStore(state => state.setActiveProject);
  const [connectOpen, setConnectOpen] = useState(false);
  const [source,setSource] = useState<IDEFileSourceId>('local');
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
    { id:'local', label:'Local', state: project?.kind === 'filesystem' && ready ? 'connected' : 'disconnected', detail:descriptions.local },
    { id:'github', label:'GitHub', state:'disconnected', detail:descriptions.github },
    { id:'r2', label:'Cloudflare R2', state:'disconnected', detail:descriptions.r2 },
    { id:'drive', label:'Google Drive', state:'disconnected', detail:descriptions.drive },
    { id:'container', label:'Cloudflare container', state:'disconnected', detail:descriptions.container },
    { id:'docker', label:'Docker', state:'disconnected', detail:descriptions.docker },
  ]), [project?.kind, ready]);

  if(source!=='local')return <RemoteFilesSource source={source} onSelect={setSource}
    palette={palette} hostConnected={Boolean(project?.kind==='filesystem'&&ready)} />;
  if (!project || projectNeedsConnection(project) || !ready || connectOpen)
    return <div className="h-full overflow-y-auto"><WorkspaceSourceRail sources={sources} sourceId="local" onSelect={setSource}/><WorkspaceGate project={project} force={connectOpen || !project} />
      {connectOpen ? <button className="m-3 rounded border px-3 py-2 text-xs" type="button" onClick={()=>setConnectOpen(false)}>Back to editor</button> : null}
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
      <Suspense fallback={<p className="p-4 text-xs text-muted-foreground">Loading AgentSam IDE…</p>}>
      <WorkspaceEditor key={project.id} workspace={workspace} workspaceId={project.id}
        label={project.name} palette={palette} lsp={lsp} showHostModes sources={sources} sourceId="local"
        onSourceSelect={id => setSource(id)}/>
      </Suspense>
    </div>
  </section>;
}
