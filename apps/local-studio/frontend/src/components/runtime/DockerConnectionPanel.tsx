import { useCallback, useEffect, useState } from 'react';
import { Container, RefreshCw, ShieldCheck, HardDrive, Server, ExternalLink } from 'lucide-react';
import { isPackagedDesktop } from '@/lib/desktop/tauri';
import { getAgentsamdToken, setAgentsamdToken, probeAgentsamd } from '@/lib/work/agentsamd-client';
import { listLocalStudioConnections, installLocalStudioPublicPlugin, updateLocalStudioPlugin } from '@/lib/connections/client';
import {
  dockerBridge, dockerEngineHealth, listDockerContexts, listDockerContainers,
  dockerContainerAction, dockerContainerLogs, type DockerContext,
  type DockerContainer, type DockerSelection,
} from '@/lib/work/docker-ide-workspace';

export function DockerConnectionPanel({onOpenWorkspace}:{
  onOpenWorkspace?:(selection:DockerSelection)=>void;
}) {
  const [contexts,setContexts]=useState<DockerContext[]>([]);
  const [installation,setInstallation]=useState<'checking'|'installed'|'not_installed'|'disabled'|'error'>('checking');
  const [installationId,setInstallationId]=useState('');
  const [context,setContext]=useState('');
  const [containers,setContainers]=useState<DockerContainer[]>([]);
  const [container,setContainer]=useState('');
  const [root,setRoot]=useState('');
  const [allowWrites,setAllowWrites]=useState(false);
  const [connected,setConnected]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [logs,setLogs]=useState('');
  const [showRemote,setShowRemote]=useState(false);
  const [remoteName,setRemoteName]=useState('');
  const [remoteEndpoint,setRemoteEndpoint]=useState('');
  const desktop=isPackagedDesktop();
  const [host,setHost]=useState<'checking'|'ready'|'needs_pairing'|'offline'>(desktop?'ready':'checking');
  const [pairToken,setPairToken]=useState('');
  const detectHost=useCallback(async()=>{
    if(desktop){setHost('ready');return;}
    setHost('checking');
    if(!(await probeAgentsamd())){setHost('offline');return;}
    setHost(getAgentsamdToken()?'ready':'needs_pairing');
  },[desktop]);
  useEffect(()=>{void detectHost();},[detectHost]);
  const pair=()=>{
    if(!setAgentsamdToken(pairToken)){setError('That is not a pairing token. It is 64 characters.');return;}
    setPairToken('');setError('');void detectHost();
  };
  const refreshInstall=useCallback(async()=>{
    setInstallation('checking');
    try {
      const registry=await listLocalStudioConnections();
      const installed=registry.plugins?.find(row=>row.plugin_key==='agentsam-docker-engine');
      setInstallationId(installed?.id || '');
      setInstallation(!installed?'not_installed':installed.is_enabled?'installed':'disabled');
    } catch {
      setInstallation('error');
    }
  },[]);
  useEffect(()=>{void refreshInstall();},[refreshInstall]);
  const install=async()=>{
    setLoading(true);setError('');
    try {
      if(installation==='disabled') await updateLocalStudioPlugin(installationId,{enabled:true});
      else await installLocalStudioPublicPlugin('agentsam-docker-engine');
      await refreshInstall();
      setNotice('Docker integration installed. Engine authorization is a separate step.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  };

  const refresh=useCallback(async()=>{
    if(host!=='ready')return;
    setLoading(true);setError('');
    try{const items=await listDockerContexts();setContexts(items);
      setContext(value=>items.some(item=>item.name===value)?value:'');
    }catch(e){
      if((e as {code?:string})?.code==='agentsamd_pairing_required')void detectHost();
      setError(e instanceof Error?e.message:String(e));
    }
    finally{setLoading(false);}
  },[host,detectHost]);
  useEffect(()=>{void refresh();},[refresh]);
  const check=async(chosen=context)=>{
    if(!chosen)return;
    setLoading(true);setError('');setConnected(false);setContainers([]);setContainer('');setLogs('');
    try{
      await dockerEngineHealth(chosen);
      setContainers(await listDockerContainers(chosen));
      setConnected(true);setNotice('Engine verified through your Docker context.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  };
  const addRemote=async()=>{
    setLoading(true);setError('');setNotice('');
    try{
      if(!window.confirm('Add this remote SSH Docker engine to your local Docker contexts? The engine will use your existing SSH authorization.'))return;
      await dockerBridge('createContext',{context:remoteName,endpoint:remoteEndpoint,approved:true});
      await refresh();setContext(remoteName);setShowRemote(false);setRemoteName('');setRemoteEndpoint('');
      setNotice('Remote context saved on this computer. Verify it to access containers.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  };
  const manage=async(action:'start'|'stop'|'restart')=>{
    if(!context||!container)return;
    if(!window.confirm(action[0].toUpperCase()+action.slice(1)+' container '+container+' on '+context+'?'))return;
    setLoading(true);setError('');
    try{await dockerContainerAction(context,container,action,true);await check(context);}
    catch(e){setError(e instanceof Error?e.message:String(e));setLoading(false);}
  };
  const viewLogs=async()=>{
    if(!context||!container)return;
    setLoading(true);setError('');
    try{setLogs(await dockerContainerLogs(context,container));}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  };
  const open=()=>{
    if(!context||!container||!root||root==='/'){setError('Select an engine and container, then enter an explicit non-root workspace directory.');return;}
    if(allowWrites&&!window.confirm('Allow AgentSam to change files under '+root+' in '+container+'? Container permissions remain enforced by Docker.'))return;
    onOpenWorkspace?.({context,container,root,allowWrites});
  };

  if(installation!=='installed')return <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm" aria-label="Docker plugin installation">
    <div className="flex items-center gap-2"><Container size={17}/><strong>Docker integration</strong></div>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
    {installation==='checking'?<p role="status" className="text-muted-foreground">Checking your account's installed plugins…</p>:
      installation==='error'?<p role="alert" className="text-muted-foreground">Plugin status could not be verified. Docker access has not been granted.</p>:
      installation==='disabled'?<p className="text-muted-foreground">Docker is disabled for this account. Enable it to choose and verify an engine.</p>:
      <p className="text-muted-foreground">Install Docker for this account. Installation does not connect to an engine or grant host access.</p>}
    <div className="flex gap-2">
      {installation==='not_installed'?<button type="button" className="rounded-md border border-border px-3 py-2 hover:bg-muted" disabled={loading} onClick={()=>void install()}>Install Docker plugin</button>:null}
      <a className="rounded-md border border-border px-3 py-2 hover:bg-muted" href="/admin/settings/customize?view=plugins">Manage plugins</a>
      {installation==='error'?<button type="button" onClick={()=>void refreshInstall()} className="rounded-md border border-border px-3 py-2">Retry</button>:null}
    </div>
  </section>;

  if(host!=='ready')return <section className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm" aria-label="Docker Engine connection manager">
    <div className="flex items-center gap-2"><Container size={17}/><strong>Docker Engine</strong></div>
    {host==='checking'?<p className="text-muted-foreground">Looking for AgentSam on this computer…</p>:null}
    {host==='offline'?<>
      <p className="text-muted-foreground">AgentSam can’t see your computer yet. Open AgentSam Desktop or start the local runtime, then check again.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={()=>void detectHost()} className="rounded-md border border-border px-3 py-2 text-xs hover:bg-muted">Check again</button>
        <a href="/admin/settings/network" className="inline-flex items-center gap-1 text-xs underline underline-offset-4">Manage device connection <ExternalLink size={12}/></a>
      </div></>:null}
    {host==='needs_pairing'?<>
      <p className="text-muted-foreground">Connect this browser to your computer to use your Docker engines. Paste the pairing token from your local runtime.</p>
      <div className="flex gap-2">
        <input type="password" autoComplete="off" spellCheck={false} value={pairToken} onChange={e=>setPairToken(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter')pair();}} aria-label="Pairing token" placeholder="Pairing token"
          className="min-h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground"/>
        <button type="button" onClick={pair} disabled={!pairToken.trim()} className="rounded-md border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50">Connect</button>
      </div>
      {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}</>:null}
  </section>;

  return <section className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm" aria-label="Docker Engine connection manager">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Container size={17}/><div><h3 className="font-semibold">Docker Engine</h3>
        <p className="text-xs text-muted-foreground">Local socket or existing SSH/TLS Docker context</p></div></div>
      <button type="button" disabled={loading} onClick={()=>void refresh()} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 hover:bg-muted" aria-label="Refresh Docker contexts"><RefreshCw size={14}/><span>Refresh</span></button>
    </div>
    {error&&<p role="alert" className="rounded-md border border-destructive p-2 text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">Docker context
        <select className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground" value={context}
          onChange={e=>{setContext(e.target.value);setConnected(false);setContainers([]);setContainer('');setLogs('');}}>
          <option value="">Choose a Docker engine</option>
          {contexts.map(item=><option key={item.name} value={item.name}>{item.name}{item.current==='true'?' · current':''}</option>)}
        </select>
      </label>
      <button type="button" disabled={!context||loading} onClick={()=>void check()} className="self-end rounded-md border border-border px-3 py-2.5 text-xs hover:bg-muted disabled:opacity-50">Verify engine</button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ShieldCheck size={14}/> {connected?'Verified engine session':'No verified engine'}
      </span>
      <button type="button" className="underline underline-offset-4" onClick={()=>setShowRemote(value=>!value)}>{showRemote?'Close remote setup':'+ Add remote engine'}</button>
    </div>
    {showRemote&&<div className="space-y-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <strong>Connect a remote Docker engine over SSH</strong>
      <p className="text-muted-foreground">Uses your local SSH configuration and Docker context credentials. Never places your SSH private key in AgentSam.</p>
      <label className="block">Context name<input className="mt-1 w-full rounded border border-border bg-background p-2" value={remoteName} onChange={e=>setRemoteName(e.target.value)} placeholder="my-server"/></label>
      <label className="block">SSH engine endpoint<input className="mt-1 w-full rounded border border-border bg-background p-2" value={remoteEndpoint} onChange={e=>setRemoteEndpoint(e.target.value)} placeholder="ssh://user@server.example.com"/></label>
      <button type="button" disabled={loading||!remoteName||!remoteEndpoint.startsWith('ssh://')} onClick={()=>void addRemote()} className="rounded-md border border-border px-3 py-2">Add context</button>
    </div>}
    {connected&&<div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center gap-2 text-xs"><Server size={14}/><strong>Containers</strong><span className="text-muted-foreground">{containers.length} reported</span></div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Select container
        <select className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
          value={container} onChange={e=>{setContainer(e.target.value);setLogs('');}}>
          <option value="">Choose a container</option>
          {containers.map(item=><option key={item.ID} value={item.ID}>{item.Names||item.ID} · {item.Image} · {item.State}</option>)}
        </select>
      </label>
      {container&&<div className="flex flex-wrap gap-2">
        <button className="rounded-md border border-border px-3 py-1.5 text-xs" disabled={loading} onClick={()=>void viewLogs()}>View logs</button>
        <button className="rounded-md border border-border px-3 py-1.5 text-xs" disabled={loading} onClick={()=>void manage('start')}>Start</button>
        <button className="rounded-md border border-border px-3 py-1.5 text-xs" disabled={loading} onClick={()=>void manage('stop')}>Stop</button>
        <button className="rounded-md border border-border px-3 py-1.5 text-xs" disabled={loading} onClick={()=>void manage('restart')}>Restart</button>
      </div>}
      {logs&&<pre className="max-h-48 overflow-auto rounded-md border border-border bg-background p-3 text-xs whitespace-pre-wrap break-all">{logs}</pre>}
      {onOpenWorkspace&&container&&!desktop&&<p className="text-xs text-muted-foreground">Open AgentSam Desktop to browse and edit container files.</p>}
      {onOpenWorkspace&&container&&desktop&&<div className="space-y-3 border-t border-border pt-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Authorized container workspace directory
          <input className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={root} onChange={e=>setRoot(e.target.value)} placeholder="/app or /work"/>
        </label>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={allowWrites} onChange={e=>setAllowWrites(e.target.checked)}/>
          <span>Allow version-checked file edits in the selected container directory</span>
        </label>
        <button type="button" disabled={!root||root==='/'||loading} onClick={open} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-primary-foreground disabled:opacity-50"><HardDrive size={14}/> Open in Monaco Files</button>
      </div>}
    </div>}
  </section>;
}
