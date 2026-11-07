import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { WorkspaceSourceRail, type IDEFileSource, type IDEFileSourceId } from '@inneranimalmedia/agentsam-ide/surface';
import type { AgentSamEditorPalette } from '@inneranimalmedia/agentsam-ide/monaco';
import { openExternalUrl, isPackagedDesktop } from '@/lib/desktop/tauri';
import {
  createRemoteIDEWorkspace, discoverIDESources, listIDEGithubRepos, listIDER2Buckets, listIDEContainers,
  type IDESourceDiscovery,
} from '@/lib/work/remote-ide-workspace';
import { beginLocalStudioConnectorOAuth, startLocalStudioProviderConnection } from '@/lib/connections/client';
const WorkspaceEditor=lazy(()=>import('@inneranimalmedia/agentsam-ide/surface').then(mod=>({default:mod.WorkspaceEditor})));
const empty:IDESourceDiscovery={ok:true,googleDrive:[],github:[],cloudflare:[]};
const info:Record<IDEFileSourceId,string>={
  local:'Authorized local filesystem',
  github:'GitHub repositories from your existing Local Studio OAuth connection',
  r2:'Cloudflare R2',
  drive:'Google Drive files authorized to this OAuth app',
  container:'Cloudflare container applications; filesystem requires a separate scoped runtime',
  docker:'Docker Engine; requires an authorized host runtime',
};
export function RemoteFilesSource({source,onSelect,palette,hostConnected}:{
  source:IDEFileSourceId;onSelect:(s:IDEFileSourceId)=>void;
  palette:AgentSamEditorPalette;hostConnected:boolean;
}){
  const [catalog,setCatalog]=useState<IDESourceDiscovery>(empty);
  const [loading,setLoading]=useState(false);
  const [monacoReady,setMonacoReady]=useState(false);
  const [monacoFailure,setMonacoFailure]=useState('');
  useEffect(()=>{
    let live=true;
    if(!import.meta.env.SSR){
      void import('./monaco-runtime').then(()=>{if(live)setMonacoReady(true);})
        .catch(e=>{if(live)setMonacoFailure(e instanceof Error?e.message:String(e));});
    }
    return ()=>{live=false;};
  },[]);
  const [error,setError]=useState('');
  const [account,setAccount]=useState('');
  const [bucket,setBucket]=useState('');
  const [buckets,setBuckets]=useState<Array<{name:string;jurisdiction:string}>>([]);
  const [repos,setRepos]=useState<Array<{fullName:string;defaultBranch:string;private:boolean;canPush:boolean}>>([]);
  const [repository,setRepository]=useState('');
  const [apps,setApps]=useState<Array<{id:string;name:string;instances?:unknown}>>([]);
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{setCatalog(await discoverIDESources());}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{setAccount('');setBucket('');setBuckets([]);setRepos([]);setRepository('');setApps([]);setError('');},[source]);
  const accounts=source==='drive'?catalog.googleDrive:source==='github'?catalog.github:catalog.cloudflare;
  const selected=accounts.some(a=>a.account===account);
  const remote=useMemo(()=>{
    if(!selected)return null;
    if(source==='drive')return createRemoteIDEWorkspace({source:'drive',account});
    if(source==='github'){
      const repo=repos.find(item=>item.fullName===repository);
      if(repo)return createRemoteIDEWorkspace({source:'github',account,repository:repo.fullName,branch:repo.defaultBranch,canPush:repo.canPush});
    }
    if(source==='r2'&&bucket&&buckets.some(item=>item.name===bucket))return createRemoteIDEWorkspace({source:'r2',account,bucket,jurisdiction:buckets.find(item=>item.name===bucket)?.jurisdiction});
    return null;
  },[source,account,bucket,buckets,repos,repository,selected]);
  const sources=useMemo<IDEFileSource[]>(()=>[
    {id:'local',label:'Local',state:hostConnected?'connected':'disconnected',detail:info.local},
    {id:'github',label:'GitHub',state:catalog.github?.length?'connected':'disconnected',detail:info.github},
    {id:'r2',label:'Cloudflare R2',state:catalog.cloudflare.some(c=>c.scopes.some(s=>s==='workers-r2.read'||s==='workers-r2-bucket-item.read'))?'connected':'disconnected',detail:info.r2},
    {id:'drive',label:'Drive',state:catalog.googleDrive.length?'connected':'disconnected',detail:info.drive},
    {id:'container',label:'Cloudflare containers',state:catalog.cloudflare.some(c=>c.scopes.includes('containers.read'))?'connected':'disconnected',detail:info.container},
    {id:'docker',label:'Docker',state:'disconnected',detail:info.docker},
  ],[hostConnected,catalog]);
  const connect=async()=>{
    setError('');
    try{
      const returnTo=window.location.pathname+window.location.search;
      if(source==='github'||source==='drive'){
        const result=await beginLocalStudioConnectorOAuth(source==='github'?'github':'google_drive',returnTo);
        if(!result.authorize_url)throw Error('oauth_authorization_url_unavailable');
        if(isPackagedDesktop())await openExternalUrl(result.authorize_url);
        else window.location.assign(result.authorize_url);
      }else if(source==='r2'||source==='container'){
        await startLocalStudioProviderConnection('cloudflare',{returnTo});
      }
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const loadRepos=async()=>{
    setError('');
    try{
      const all:Array<{fullName:string;defaultBranch:string;private:boolean;canPush:boolean}>=[];
      for(let page=1;page<=10;page++){
        const data=await listIDEGithubRepos(account,page);
        all.push(...data.repositories);
        if(data.truncated)throw Error('GitHub returned more than 1,000 repositories. Narrow your connected account.');
        if(!data.nextPage)break;
      }
      setRepos(all);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const loadBuckets=async()=>{
    setError('');
    try{const r=await listIDER2Buckets(account);if(r.cursor)throw Error('R2 bucket listing requires pagination.');setBuckets(r.buckets);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const loadContainers=async()=>{
    setError('');
    try{const r=await listIDEContainers(account);setApps(r.applications);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  return <div className="work-files-stage flex h-full min-h-0 flex-col">
    {!remote ? <WorkspaceSourceRail sources={sources} sourceId={source} onSelect={onSelect}/> : null}
    {error?<p role="alert" className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</p>:null}
    {remote?<div className="min-h-0 flex-1">
      {monacoFailure?<p role="alert" className="p-3 text-xs text-destructive">Monaco runtime unavailable: {monacoFailure}</p>:null}
      {!monacoReady&&!monacoFailure?<p className="p-3 text-xs text-muted-foreground">Initializing Monaco language workers…</p>:null}
      {monacoReady&&!monacoFailure?<>
      <Suspense fallback={<p className="p-4 text-xs">Loading IDE…</p>}>
        <WorkspaceEditor key={source+':'+account+':'+bucket} workspace={remote}
          workspaceId={source+':'+account+':'+bucket} palette={palette}
          label={source==='drive'?'Google Drive · '+account:source==='github'?'GitHub · '+repository:'R2 · '+bucket}
          sources={sources} sourceId={source} onSourceSelect={onSelect}/>
      </Suspense></>:null}
    </div>:<div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div><h2 className="text-base font-semibold">{sources.find(s=>s.id===source)?.label}</h2>
          <p className="mt-1 text-muted-foreground">{info[source]}</p></div>
        {(source==='drive'||source==='r2'||source==='container'||source==='github')?<>
          <div className="flex gap-2">
            <select aria-label="Connected provider account" className="min-w-0 flex-1 rounded border border-border bg-background p-2"
              value={selected?account:''} onChange={e=>{setAccount(e.target.value);setBucket('');setBuckets([]);setRepos([]);setRepository('');setApps([]);}}>
              <option value="">Choose connected account</option>
              {accounts.map(a=><option key={a.account} value={a.account}>{a.label||a.account}</option>)}
            </select>
            <button className="rounded border border-border px-3" onClick={()=>void refresh()} disabled={loading}>Refresh</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded border border-border px-3 py-2" onClick={()=>void connect()}>
              {source==='drive'?'Connect Google Drive':source==='github'?'Connect GitHub':'Connect Cloudflare'}</button>
            {source==='github'&&selected?<button className="rounded border border-border px-3 py-2" onClick={()=>void loadRepos()}>Browse repositories</button>:null}
            {source==='r2'&&selected?<button className="rounded border border-border px-3 py-2" onClick={()=>void loadBuckets()}>Browse buckets</button>:null}
            {source==='container'&&selected?<button className="rounded border border-border px-3 py-2" onClick={()=>void loadContainers()}>Browse applications</button>:null}
          </div>
          {!accounts.length?<p className="text-muted-foreground">No authorized account detected. Connect using the existing OAuth flow.</p>:null}
          {source==='drive'?<p className="text-muted-foreground">Drive's drive.file scope only exposes files this app is authorized to access. Files open as read-only text while conditional writes are being verified.</p>:null}
          {source==='github'&&repos.length?<label className="flex items-center gap-2">Repository
            <select className="min-w-0 flex-1 rounded border border-border bg-background p-2" value={repository} onChange={e=>setRepository(e.target.value)}>
              <option value="">Choose a repository</option>
              {repos.map(repo=><option key={repo.fullName} value={repo.fullName}>{repo.fullName} · {repo.defaultBranch}{repo.canPush?'':' (read only)'}</option>)}
            </select></label>:null}
          {source==='r2'&&buckets.length?<label className="flex items-center gap-2">Bucket
            <select className="min-w-0 flex-1 rounded border border-border bg-background p-2" value={bucket}
              onChange={e=>setBucket(e.target.value)}><option value="">Choose bucket</option>
              {buckets.map(b=><option key={b.name} value={b.name}>{b.name} ({b.jurisdiction})</option>)}
            </select></label>:null}
          {source==='container'&&apps.length?<div className="space-y-2">
            {apps.map(app=><div className="rounded border border-border p-3" key={app.id}><strong>{app.name}</strong>
              <p className="mt-1 text-muted-foreground">{app.id}</p></div>)}
            <p className="text-muted-foreground">Application discovery is live; file mounting requires an authorized container bridge.</p>
          </div>:null}
        </>:<p className="text-muted-foreground">Dockerize CLI creates and packages images; direct filesystem browsing requires a selected Docker host/container and an authorized root.</p>}
      </div>
    </div>}
  </div>;
}
