import { resolveIamIssuer } from '@inneranimalmedia/agentsam-identity/contracts/auth-config';
import { createAccountWorkspacePolicy } from '@inneranimalmedia/agentsam-identity/server/mcp-workspace-policy';

// A CLI bearer is resolved at IAM, never treated as an arbitrary account ID.
// MCP resource tokens and service credentials are deliberately not accepted here.
export async function resolveMcpCliAccount(request, env, purpose, fetcher=fetch) {
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer\s+\S+$/i.test(authorization)||!env.DB||!env.IAM_OAUTH_ISSUER)return null;
  const response=await fetcher(new URL('/api/sdk/context',resolveIamIssuer(env)),{
    headers:{authorization,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)return null;
  const context=await response.json();
  const type=context.auth_type;
  if(!['agentsam_browser_oauth','agentsam_api_key'].includes(type)||!context.owner_account_id)return null;
  const scopes=new Set(Array.isArray(context.tokenPermissions)?context.tokenPermissions:
    Array.isArray(context.credential?.scopes)?context.credential.scopes:[]);
  if(purpose==='register' && !(type==='agentsam_browser_oauth' && scopes.has('iam:agent')))return null;
  if(purpose==='workspace' && !(scopes.has('terminal:exec:local') && (scopes.has('account:read')||scopes.has('iam:workspaces'))))return null;
  const account=await env.DB.prepare("SELECT id FROM accounts WHERE id=? AND status='active'").bind(context.owner_account_id).first();
  return account?.id||null;
}

export async function handleMcpWorkspacePolicy(request,env,accountId){
  const reply=(body,status)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
  if(!accountId)return reply({ok:false,error:'unauthorized'},401);
  if(request.method!=='GET')return reply({ok:false,error:'method_not_allowed'},405);
  const q=new URL(request.url).searchParams;
  const workspaceId=q.get('workspace_id'),connectionId=q.get('connection_id'),operation=q.get('operation');
  if(![workspaceId,connectionId].every(v=>typeof v==='string'&&/^[a-z0-9_-]{1,128}$/i.test(v))||
     !['workspace.read','workspace.stat','workspace.list'].includes(operation))return reply({ok:false,error:'mcp_workspace_context_invalid'},400);
  const decision=await createAccountWorkspacePolicy({db:env.DB,accountId,workspaceId,connectionId})({
    principal:{kind:'oauth',account_id:accountId},operation,
  });
  // This is an account policy decision, not a device grant. The local host
  // must separately validate its existing workspace capability and root.
  return decision.allowed?reply({ok:true,accountId,workspaceId,connectionId,instanceId:decision.instanceId,root:decision.root},200):
    reply({ok:false,error:decision.reason},403);
}
