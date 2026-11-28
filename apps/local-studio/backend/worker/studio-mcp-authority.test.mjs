import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMcpCliAccount,handleMcpWorkspacePolicy} from './studio-mcp-authority.js';

const request=(suffix='',method='GET',bearer='fixture')=>new Request('https://agentsam.inneranimalmedia.com/api/settings/mcps'+suffix,{method,headers:{authorization:'Bearer '+bearer}});
const db={prepare(sql){return {bind(id){return {async first(){assert.match(sql,/accounts/);return id==='a'?{id}:null}}}}}};
const env={DB:db,IAM_OAUTH_ISSUER:'https://issuer.example'};
const context=(auth_type,tokenPermissions,owner_account_id='a')=>async()=>Response.json({auth_type,tokenPermissions,owner_account_id});
test('MCP registration requires explicit account OAuth write scope, not an API key or resource token',async()=>{
  const good=context('agentsam_browser_oauth',['iam:agent']);
  assert.equal(await resolveMcpCliAccount(request(),env,'register',good),'a');
  for(const [type,scopes] of [['agentsam_browser_oauth',['iam:profile']],['agentsam_api_key',['account:read','iam:agent']],['mcp_oauth',['iam:agent']]]) {
    assert.equal(await resolveMcpCliAccount(request(),env,'register',context(type,scopes)),null);
  }
  assert.equal(await resolveMcpCliAccount(request(),env,'register',context('agentsam_browser_oauth',['iam:agent'],'other')),null);
});
test('local workspace policy requires existing delegated local execution scope and account read scope',async()=>{
  assert.equal(await resolveMcpCliAccount(request(),env,'workspace',context('agentsam_api_key',['account:read','terminal:exec:local'])),'a');
  assert.equal(await resolveMcpCliAccount(request(),env,'workspace',context('agentsam_api_key',['account:read'])),null);
  assert.equal(await resolveMcpCliAccount(request(),env,'workspace',context('agentsam_api_key',['terminal:exec:remote','account:read'])),null);
});
test('workspace policy denies anonymous callers, mutations and unrecognized operations',async()=>{
  const suffix='/workspace-policy?workspace_id=w&connection_id=c&operation=workspace.write';
  assert.equal((await handleMcpWorkspacePolicy(request(suffix),env,null)).status,401);
  assert.equal((await handleMcpWorkspacePolicy(request(suffix,'POST'),env,'a')).status,405);
  assert.equal((await handleMcpWorkspacePolicy(request(suffix),env,'a')).status,400);
});
