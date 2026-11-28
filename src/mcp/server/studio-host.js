import { resolveAccountAuthority } from '../../lib/auth.js';
import { resolveLocalStudioHostOrigin } from '../../lib/app-authority.js';
import { collectLocalTerminalContext } from '../../lib/terminal-local.js';
import { readLocalRuntimeRecord } from '../../local-fs/capability.js';
import { createMcpServer } from './index.js';
import { registerWorkspaceReadTools } from './workspace.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fs from 'node:fs';
import path from 'node:path';

export async function requestStudioMcp(suffix='', { method='GET', body, ...options }={}) {
  const authority=await (options.resolveAuthorityImpl||resolveAccountAuthority)(options);
  if(!authority?.value || authority.error)throw new Error('mcp_account_auth_required');
  const origin=resolveLocalStudioHostOrigin();
  const response=await (options.fetchImpl||fetch)(new URL('/api/settings/mcps'+suffix,origin),{
    method,redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{authorization:'Bearer '+authority.value,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||result?.ok!==true)throw new Error(result?.error||'mcp_studio_request_failed');
  return result;
}

const localOrigin = record => {
  try {
    const u=new URL(record.runtimeBaseUrl);
    if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return null;
    return u.origin;
  } catch { return null; }
};

export function createNativeWorkspaceGrant({ root, workspaceId, connectionId, ...options }) {
  const boundRoot=fs.realpathSync(path.resolve(root));
  if(!workspaceId||!connectionId)throw new Error('mcp_workspace_context_required');
  const load=options.readRecord||readLocalRuntimeRecord;
  const request=options.requestPolicy||((operation)=>requestStudioMcp('/workspace-policy?'+new URLSearchParams({workspace_id:workspaceId,connection_id:connectionId,operation}),options));
  return async ({ principal, operation }) => {
    try {
      const decision=await request(operation);
      if(decision.ok!==true||decision.accountId!==principal.account_id||decision.workspaceId!==workspaceId||decision.connectionId!==connectionId||fs.realpathSync(decision.root)!==boundRoot)return {allowed:false};
      const device=await (options.collectDeviceContext||collectLocalTerminalContext)(options);
      if(!decision.instanceId||!device.instances?.some(i=>i.instance_id===decision.instanceId&&i.connection_id===connectionId&&i.account_id===principal.account_id&&i.status==='paired'))return {allowed:false};
      const record=load(boundRoot);
      const origin=record&&localOrigin(record);
      if(!origin||record.schema!=='agentsam.local-workspace-capability.v1'||typeof record.capability!=='string'||!/^awc_[a-f0-9]{48}$/.test(record.capability)||!Number.isFinite(Date.parse(record.expires_at))||Date.parse(record.expires_at)<=Date.now()||fs.realpathSync(record.root)!==boundRoot)return {allowed:false};
      const fetcher=options.deviceFetch||fetch;
      const health=await fetcher(origin+'/health',{redirect:'error',signal:AbortSignal.timeout(2000)});
      const status=await health.json();
      if(!health.ok||!status.ok||status.workspace_id!==record.workspace_id||fs.realpathSync(status.root)!==boundRoot)return {allowed:false};
      const check=await fetcher(origin+'/v1/fs/stat?path=.',{headers:{'x-agentsam-workspace-capability':record.capability},redirect:'error',signal:AbortSignal.timeout(2000)});
      if(!check.ok||!(await check.json()).ok)return {allowed:false};
      return {allowed:true,root:boundRoot};
    } catch {return {allowed:false};}
  };
}

const TOOL_NAMES=['workspace.read','workspace.stat','workspace.list'];
export async function serveNativeWorkspace({root,workspaceId,connectionId,...options}) {
  const boundRoot=fs.realpathSync(path.resolve(root));
  const suffix='/workspace-policy?'+new URLSearchParams({workspace_id:workspaceId,connection_id:connectionId,operation:'workspace.read'});
  const decision=await requestStudioMcp(suffix,options);
  if(!decision.accountId||fs.realpathSync(decision.root)!==boundRoot)throw new Error('mcp_workspace_root_mismatch');
  const principal={kind:'local',subject:decision.accountId,account_id:decision.accountId,scopes:['workspace:read']};
  const authorize=createNativeWorkspaceGrant({root:boundRoot,workspaceId,connectionId,...options});
  if(!(await authorize({principal,operation:'workspace.read'})).allowed)throw new Error('mcp_device_grant_required');
  const manifest={schema_version:'agentsam.mcp.v1',name:'agentsam-workspace',version:'1.0.0',
    runtime:{kind:'node',language:'javascript'},transport:{kind:'stdio'},auth:{type:'local'},
    scopes:[{scope:'workspace:read'}],tools:TOOL_NAMES.map(name=>({name,title:name,description:'Read the explicitly authorized workspace: '+name,required_scopes:['workspace:read'],annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}}))};
  const server=createMcpServer(manifest,principal,(instance,context)=>registerWorkspaceReadTools(instance,{...context,authorize}));
  await server.connect(options.transport || new StdioServerTransport());
  return server;
}
