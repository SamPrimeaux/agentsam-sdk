import { useCallback, useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const renderIDEWorkspaceMarkdown = (content:string) => <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>;
import { AgentSamFilesystem, type AgentSamFilesystemSource, type IDEFileSource, type IDEFileSourceId } from '@inneranimalmedia/agentsam-ide/surface';
import type { AgentSamEditorPalette } from '@inneranimalmedia/agentsam-ide/monaco';
import { openExternalUrl, isPackagedDesktop } from '@/lib/desktop/tauri';
import {
  createRemoteIDEWorkspace, discoverIDESources, listIDEGithubRepos, listIDEGithubBranches, listIDER2Buckets, listIDEContainers,
  type IDESourceDiscovery,
} from '@/lib/work/remote-ide-workspace';
import { beginLocalStudioRegisteredPluginOAuth } from '@/lib/connections/client';
import { DockerConnectionPanel } from '@/components/runtime/DockerConnectionPanel';
import { createDockerIDEWorkspace, type DockerSelection } from '@/lib/work/docker-ide-workspace';
const empty:IDESourceDiscovery={ok:true,googleDrive:[],github:[],cloudflare:[],connectionPlugins:{googleDrive:null,github:null,cloudflare:null}};
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
  const [branch,setBranch]=useState('');
  const [branches,setBranches]=useState<Array<{name:string;protected:boolean}>>([]);
  const [apps,setApps]=useState<Array<{id:string;name:string;instances?:unknown}>>([]);
  const [dockerSelection,setDockerSelection]=useState<DockerSelection|null>(null);
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{setCatalog(await discoverIDESources());}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  // Return from an OAuth popup/redirect without forcing users through Settings.
  useEffect(()=>{
    const onFocus=()=>{void refresh();};
    window.addEventListener('focus',onFocus);
    return ()=>window.removeEventListener('focus',onFocus);
  },[refresh]);
  useEffect(()=>{setAccount('');setBucket('');setBuckets([]);setRepos([]);setRepository('');setBranch('');setBranches([]);setApps([]);setDockerSelection(null);setError('');},[source]);
  const accounts=source==='drive'?catalog.googleDrive:source==='github'?catalog.github:catalog.cloudflare;
  const selected=accounts.some(a=>a.account===account);
  useEffect(()=>{
    if(accounts.length===1 && !selected) setAccount(accounts[0]!.account);
  },[accounts,selected]);
  const remote=useMemo(()=>{
    if(source==='docker')return dockerSelection?createDockerIDEWorkspace(dockerSelection):null;
    if(!selected)return null;
    if(source==='drive')return createRemoteIDEWorkspace({source:'drive',account});
    if(source==='github'){
      const repo=repos.find(item=>item.fullName===repository);
      if(repo)return createRemoteIDEWorkspace({source:'github',account,repository:repo.fullName,
        branch:branches.some(item=>item.name===branch)?branch:repo.defaultBranch,
        baseBranch:repo.defaultBranch,canPush:repo.canPush});
    }
    if(source==='r2'&&bucket&&buckets.some(item=>item.name===bucket))return createRemoteIDEWorkspace({source:'r2',account,bucket,jurisdiction:buckets.find(item=>item.name===bucket)?.jurisdiction});
    return null;
  },[source,account,bucket,buckets,repos,repository,branch,branches,selected,dockerSelection]);
  const sources=useMemo<IDEFileSource[]>(()=>[
    {id:'local',label:'Local',state:hostConnected?'connected':'disconnected',detail:info.local},
    {id:'github',label:'GitHub',state:catalog.github?.length?'connected':'disconnected',detail:info.github},
    {id:'r2',label:'Cloudflare R2',state:catalog.cloudflare.some(c=>c.scopes.some(s=>s==='workers-r2.read'||s==='workers-r2-bucket-item.read'))?'connected':'disconnected',detail:info.r2},
    {id:'drive',label:'Drive',state:catalog.googleDrive.length?'connected':'disconnected',detail:info.drive},
    {id:'container',label:'Cloudflare containers',state:catalog.cloudflare.some(c=>c.scopes.includes('containers.read'))?'connected':'disconnected',detail:info.container},
    {id:'docker',label:'Docker',state:dockerSelection?'connected':'disconnected',detail:info.docker},
  ],[hostConnected,catalog,dockerSelection]);
  const connect=async()=>{
    setError('');
    try{
      // The current provider OAuth plugin comes from D1's agentsam_plugins.
      // Files cannot assemble its own provider URL or OAuth scope list.
      const plugins=catalog.connectionPlugins;
      const pluginId=source==='github'?plugins?.github
        :source==='drive'?plugins?.googleDrive
        :source==='r2'||source==='container'?plugins?.cloudflare:null;
      if(!pluginId)throw Error('No registered OAuth connection plugin was found for this source. Check installed connections.');
      const returnTo=window.location.pathname+window.location.search;
      // These are provider adapter requirements, not hardcoded OAuth scopes.
      // The connection service resolves them against the live D1 catalog and
      // Cloudflare asks the user to approve the resulting permission set.
      const requested=source==='r2'?{capabilities:['cloudflare.r2']}
        :source==='container'?{capabilities:['cloudflare.containers']}:{};
      const chosenAccount=selected && account
        ? (source==='drive'?'google_drive':source==='github'?'github':'cloudflare')+':'+account
        : undefined;
      const result=await beginLocalStudioRegisteredPluginOAuth(pluginId,returnTo,{
        ...requested,...(chosenAccount?{connectionId:chosenAccount}:{}),
      });
      if(!result.authorize_url)throw Error('oauth_authorization_url_unavailable');
      if(isPackagedDesktop())await openExternalUrl(result.authorize_url);
      else window.location.assign(result.authorize_url);
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
  useEffect(()=>{
    if(source!=='github'||!selected||!repository)return;
    let live=true;
    setBranches([]);
    void (async()=>{
      try {
        const all:Array<{name:string;protected:boolean}>=[];
        for(let page=1;page<=10;page++){
          const result=await listIDEGithubBranches(account,repository,page);
          all.push(...result.branches);
          if(result.truncated)throw Error('Too many branches; narrow the GitHub repository.');
          if(!result.nextPage)break;
        }
        if(live)setBranches(all);
      }catch(e){if(live)setError(e instanceof Error?e.message:String(e));}
    })();
    return ()=>{live=false;};
  },[source,selected,account,repository]);
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
  // Account OAuth and remote I/O stay in the host's connection/backend adapters.
  // The canonical AgentSamFilesystem only receives an authorized FileWorkspace.
  const workspaceId = source === 'docker' && dockerSelection
    ? ['docker',dockerSelection.context,dockerSelection.container,dockerSelection.root].join(':')
    : [source,account,repository,branch,bucket].join(':');
  const workspaceLabel = source === 'docker' ? 'Docker · '+dockerSelection?.container
    : source === 'drive' ? 'Google Drive · '+account
    : source === 'github' ? 'GitHub · '+repository
    : 'R2 · '+bucket;
  const filesystemSources: AgentSamFilesystemSource[] = sources.map(item => item.id === source ? {
    ...item,
    workspace: monacoReady && !monacoFailure ? remote : null,
    workspaceId,
    workspaceLabel,
    context: {
      accountRef: account || undefined,
      repository: source === 'github' ? repository : undefined,
      branch: source === 'github' ? branch || repos.find(item=>item.fullName===repository)?.defaultBranch : undefined,
      bucket: source === 'r2' ? bucket : undefined,
      root: source === 'docker' ? dockerSelection?.root : undefined,
    },
    reconnect: source === 'docker'
      ? () => setDockerSelection(null) : () => void connect(),
  } : item);
  return <div className="work-files-stage flex h-full min-h-0 flex-col">
    <AgentSamFilesystem
      sources={filesystemSources} sourceId={source} onSourceSelect={onSelect}
      palette={palette} showHostModes renderMarkdown={renderIDEWorkspaceMarkdown}
      error={error || monacoFailure || undefined}
      onContextChange={context => window.dispatchEvent(
        new CustomEvent('agentsam:filesystem-context', {detail:context}),
      )}
      setup={remote
        ? (!monacoReady ? <p className="p-4 text-xs">Initializing Monaco language workers…</p> : null)
        : <div className="min-h-0 flex-1 overflow-y-auto p-4 text-xs">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <div><h2 className="text-base font-semibold">{sources.find(s=>s.id===source)?.label}</h2>
          <p className="mt-1 text-muted-foreground">{info[source]}</p></div>
        {source==='docker'?<DockerConnectionPanel onOpenWorkspace={setDockerSelection}/>:(source==='drive'||source==='r2'||source==='container'||source==='github')?<>
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
            <select className="min-w-0 flex-1 rounded border border-border bg-background p-2" value={repository} onChange={e=>{setRepository(e.target.value);setBranch('');setBranches([]);}}>
              <option value="">Choose a repository</option>
              {repos.map(repo=><option key={repo.fullName} value={repo.fullName}>{repo.fullName} · {repo.defaultBranch}{repo.canPush?'':' (read only)'}</option>)}
            </select></label>:null}
          {source==='github'&&repository?<label className="flex items-center gap-2">Branch
            <select className="min-w-0 flex-1 rounded border border-border bg-background p-2"
              value={branches.some(item=>item.name===branch)?branch:repos.find(item=>item.fullName===repository)?.defaultBranch||''}
              onChange={e=>setBranch(e.target.value)}>
              {repos.find(item=>item.fullName===repository)?.defaultBranch &&
                <option value={repos.find(item=>item.fullName===repository)!.defaultBranch}>Default · {repos.find(item=>item.fullName===repository)!.defaultBranch}</option>}
              {branches.filter(item=>item.name!==repos.find(repo=>repo.fullName===repository)?.defaultBranch)
                .map(item=><option key={item.name} value={item.name}>{item.name}{item.protected?' (protected)':''}</option>)}
            </select>
          </label>:null}
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
          </div>
      }
    />
  </div>;
}
