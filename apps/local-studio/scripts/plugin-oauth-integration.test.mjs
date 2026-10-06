import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {beginPluginOAuth,completePluginOAuth,getRemotePluginToken,runRemotePluginTool,disconnectPublicPlugin} from '../backend/worker/plugin-oauth.js';
import {listCatalogForAccount} from '../backend/worker/plugin-discovery.js';
import {createLocalStudioPluginRuntime} from '../backend/worker/plugin-registry.js';

const origin='https://plugins.example.org';
const resource=origin+'/mcp';
const endpoint=origin+'/mcp/brand';
const accountId='au_test';
const pluginId='plg_authdemo';
const token='iam_test_access_token_long_enough_123456789';
const scope='brand:read';
const metadata={
  plugin_key:'agentsam-brand',version:'1.0.0',display_name:'AgentSam Brand',
  developer_name:'Inner Animal Media',category:'Productivity',
  endpoint_url:endpoint,transport:'streamable-http',auth_type:'oauth',
  tools:['brand.get_context'],tool_count:1,skill_count:1,
  oauth_resource:resource,oauth_scopes:[scope],read_only_scopes:[scope],
  tool_permissions:[{id:'brand.get_context',title:'Brand context',scopes:[scope],read_only:true,requires_approval:false}],
};
function dbFixture() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../../../migrations/d1/0001_agentsam_plugin_runtime.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../backend/migrations/1348_agentsam_public_plugin_oauth.sql',import.meta.url),'utf8'));
  sqlite.prepare(`INSERT INTO agentsam_plugins(
    id,account_id,plugin_key,provider_key,installation_key,environment,plugin_kind,display_name,transport,auth_type,
    endpoint_url,category,is_enabled,settings_visible,composer_visible
  ) VALUES (?,?,?,?,?,'production','mcp','AgentSam Brand','remote_jsonrpc','oauth',?,'Productivity',0,1,0)`).run(
    pluginId,accountId,'agentsam-brand','agentsam-brand','catalog-v1',endpoint
  );
  const DB={
    prepare(sql){
      const stmt=sqlite.prepare(sql);
      let params=[];
      const bound={
        bind(...values){params=values;return bound},
        first(){return stmt.get(...params)||null},
        all(){return {results:stmt.all(...params)}},
        run(){const r=stmt.run(...params);return {success:true,meta:{changes:r.changes}}},
      };
      return bound;
    },
    async batch(statements){
      const results=[];
      sqlite.exec('BEGIN');
      try {for(const row of statements)results.push(row.run());sqlite.exec('COMMIT')}
      catch(error){sqlite.exec('ROLLBACK');throw error}
      return results;
    }
  };
  return {sqlite,DB};
}
const fakeTool={
 name:'brand.get_context',title:'Brand context',description:'Read authorized brand',
 inputSchema:{type:'object',properties:{}},
 annotations:{readOnlyHint:true,destructiveHint:false},
 _meta:{securitySchemes:[{type:'oauth2',scopes:[scope]}]},
};
const sharedTool={
 name:'agentsam.profile',title:'Profile',inputSchema:{type:'object',properties:{}},
 annotations:{readOnlyHint:true},_meta:{securitySchemes:[{type:'oauth2',scopes:['profile:read']}]},
};
function mockFetcher(options={}) {
  const calls=[];
  const fetcher=async (url,init={})=>{
    const href=String(url);calls.push({href,init});
    let body,status=200;
    if(href===origin+'/catalog/plugins')body={schema:'agentsam.plugin-catalog/v1',plugins:[options.metadata||metadata]};
    else if(href.endsWith('/api/oauth/register'))body={client_id:'iam_dcr_fixture1234567890'};
    else if(href.endsWith('/api/oauth/token'))body={access_token:token,refresh_token:'test-refresh-not-real',expires_in:3600};
    else if(href.endsWith('/api/oauth/userinfo'))body={
      sub:options.wrongOwner?'au_someone_else':accountId,audience:resource,scopes:options.scopes||[scope],
    };
    else if(href===(options.metadata?.endpoint_url||endpoint)){
      const rpc=JSON.parse(init.body);
      if(rpc.method==='tools/list')body={jsonrpc:'2.0',id:rpc.id,result:{tools:options.tools||[fakeTool,sharedTool]}};
      else if(rpc.method==='tools/call')body={jsonrpc:'2.0',id:rpc.id,result:{structuredContent:{ok:true,tool:rpc.params.name}}};
      else throw new Error('unknown rpc '+rpc.method);
    }else throw new Error('unexpected test network destination '+href);
    return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  };
  return {fetcher,calls};
}
const envFor=DB=>({
 DB,VAULT_MASTER_KEY:'v1.'+Buffer.alloc(32,7).toString('base64'),
 AGENTSAM_PLUGIN_CATALOG_URLS:JSON.stringify([origin+'/catalog/plugins']),
});

test('OAuth connects approved tools only after PKCE, owner, scope, and endpoint checks',async()=>{
  const {DB,sqlite}=dbFixture();const env=envFor(DB);const {fetcher,calls}=mockFetcher();
  const started=await beginPluginOAuth(env,accountId,pluginId,{},fetcher);
  assert.equal(started.status,'authorization_required');
  const authUrl=new URL(started.authorize_url);
  assert.equal(authUrl.origin,'https://inneranimalmedia.com');
  assert.equal(authUrl.searchParams.get('resource'),resource);
  assert.equal(authUrl.searchParams.get('scope'),scope);
  assert.equal(authUrl.searchParams.get('code_challenge_method'),'S256');
  assert.equal(authUrl.searchParams.get('redirect_uri'),'https://agentsam.inneranimalmedia.com/api/plugins/oauth/callback');
  const state=authUrl.searchParams.get('state');
  assert.ok(state?.length>=40);
  const pending=sqlite.prepare('SELECT * FROM agentsam_plugin_oauth_states').get();
  assert.ok(pending.verifier_ciphertext.length>40);
  assert.equal(pending.verifier_ciphertext.includes(authUrl.searchParams.get('code_challenge')),false);
  assert.ok(!sqlite.prepare('SELECT * FROM agentsam_plugin_oauth_grants').get());
  const request=new Request('https://agentsam.inneranimalmedia.com/api/plugins/oauth/callback?code=samplecode&state='+state);
  const connected=await completePluginOAuth(env,request,fetcher);
  assert.equal(connected.registered_tools,1);
  const installed=sqlite.prepare('SELECT * FROM agentsam_plugins WHERE id=?').get(pluginId);
  assert.equal(installed.setup_status,'connected');
  assert.equal(installed.is_enabled,1);
  assert.equal(installed.health_status,'healthy');
  const registered=sqlite.prepare('SELECT * FROM agentsam_tools WHERE plugin_id=?').all(pluginId);
  assert.equal(registered.length,1);
  assert.equal(registered[0].tool_key,'brand.get_context');
  assert.equal(registered[0].requires_approval,0);
  assert.equal(registered[0].account_id,accountId);
  const grant=sqlite.prepare('SELECT * FROM agentsam_plugin_oauth_grants').get();
  assert.ok(grant.credentials_ciphertext);
  assert.ok(!grant.credentials_ciphertext.includes(token));
  assert.ok(!grant.credentials_ciphertext.includes('test-refresh'));
  const used=await getRemotePluginToken(env,accountId,pluginId,fetcher);
  assert.equal(used.token,token);
  const result=await runRemotePluginTool(env,accountId,registered[0],{},fetcher);
  assert.deepEqual(result,{ok:true,tool:'brand.get_context'});
  const runtime=await createLocalStudioPluginRuntime(env,accountId,{
    mcpFetch:fetcher,
    authorizeTool:({tool})=>({allowed:tool.account_id===accountId}),
    requireApproval:()=>false,
  });
  const runtimeResult=await runtime.execute('brand.get_context',{}, {accountId});
  assert.deepEqual(runtimeResult,{ok:true,tool:'brand.get_context'});

  assert.ok(calls.some(c=>c.href===endpoint&&JSON.parse(c.init.body).method==='tools/call'));
  await assert.rejects(completePluginOAuth(env,request,fetcher),/plugin_oauth_state_invalid/);
  await assert.rejects(getRemotePluginToken(env,'au_another',pluginId,fetcher),/plugin_oauth_not_connected/);
  const catalog=await listCatalogForAccount(env,accountId,fetcher);
  assert.equal(catalog.plugins[0].availability,'connected');
  const disconnected=await disconnectPublicPlugin(env,accountId,pluginId);
  assert.equal(disconnected.disconnected,true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM agentsam_tools WHERE plugin_id=?').get(pluginId).count,0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM agentsam_plugin_oauth_grants').get().count,0);
  assert.equal(sqlite.prepare('SELECT setup_status FROM agentsam_plugins').get().setup_status,'unconfigured');
  sqlite.close();
});
test('OAuth refuses an IAM identity mismatch without enabling the plugin',async()=>{
  const {DB,sqlite}=dbFixture();const env=envFor(DB);
  const started=await beginPluginOAuth(env,accountId,pluginId,{},mockFetcher().fetcher);
  const state=new URL(started.authorize_url).searchParams.get('state');
  const request=new Request('https://agentsam.inneranimalmedia.com/api/plugins/oauth/callback?code=samplecode&state='+state);
  await assert.rejects(completePluginOAuth(env,request,mockFetcher({wrongOwner:true}).fetcher),/plugin_oauth_identity_mismatch/);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM agentsam_tools WHERE plugin_id=?').get(pluginId).count,0);
  assert.equal(sqlite.prepare('SELECT setup_status FROM agentsam_plugins').get().setup_status,'unconfigured');
  sqlite.close();
});
test('Campaign keeps writes unavailable without scopes and requires approval after explicit upgrade',async()=>{
  const {DB,sqlite}=dbFixture();const env=envFor(DB);
  const campaignEndpoint=origin+'/mcp/campaign';
  sqlite.prepare("UPDATE agentsam_plugins SET plugin_key='agentsam-campaign',provider_key='agentsam-campaign',endpoint_url=?,display_name='AgentSam Campaign' WHERE id=?").run(campaignEndpoint,pluginId);
  const campaign={
    ...metadata,plugin_key:'agentsam-campaign',display_name:'AgentSam Campaign',
    endpoint_url:campaignEndpoint,
    tools:['campaign.get_context','campaign.brief.save'],
    tool_count:2,oauth_scopes:['campaign:brief:write','campaign:read'],
    read_only_scopes:['campaign:read'],
    tool_permissions:[
      {id:'campaign.get_context',title:'Get campaign context',scopes:['campaign:read'],read_only:true,requires_approval:false},
      {id:'campaign.brief.save',title:'Save campaign brief',scopes:['campaign:brief:write'],read_only:false,requires_approval:true},
    ],
  };
  const availableTools=campaign.tool_permissions.map(permission=>({
    name:permission.id,title:permission.title,inputSchema:{type:'object',properties:{}},
    annotations:{readOnlyHint:permission.read_only},
    _meta:{securitySchemes:[{type:'oauth2',scopes:permission.scopes}]},
  }));
  const readOnly=mockFetcher({metadata:campaign,tools:availableTools,scopes:['campaign:read']});
  const started=await beginPluginOAuth(env,accountId,pluginId,{},readOnly.fetcher);
  assert.equal(new URL(started.authorize_url).searchParams.get('scope'),'campaign:read');
  await completePluginOAuth(env,new Request('https://agentsam.inneranimalmedia.com/api/plugins/oauth/callback?code=one&state='+new URL(started.authorize_url).searchParams.get('state')),readOnly.fetcher);
  assert.deepEqual(sqlite.prepare('SELECT tool_key FROM agentsam_tools WHERE plugin_id=?').all(pluginId).map(r=>r.tool_key),['campaign.get_context']);
  const elevated=mockFetcher({metadata:campaign,tools:availableTools,scopes:['campaign:read','campaign:brief:write']});
  const elevatedStart=await beginPluginOAuth(env,accountId,pluginId,{allowWrites:true},elevated.fetcher);
  assert.equal(new URL(elevatedStart.authorize_url).searchParams.get('scope'),'campaign:brief:write campaign:read');
  await completePluginOAuth(env,new Request('https://agentsam.inneranimalmedia.com/api/plugins/oauth/callback?code=two&state='+new URL(elevatedStart.authorize_url).searchParams.get('state')),elevated.fetcher);
  const write=sqlite.prepare("SELECT * FROM agentsam_tools WHERE tool_key='campaign.brief.save' AND plugin_id=?").get(pluginId);
  assert.equal(write.requires_approval,1);
  assert.equal(write.connector_access_class,'write');
  const denied=await createLocalStudioPluginRuntime(env,accountId,{
    mcpFetch:elevated.fetcher,authorizeTool:()=>({allowed:true}),requireApproval:()=>false,
  });
  await assert.rejects(denied.execute('campaign.brief.save',{}, {accountId}),/tool_not_approved/);
  const allowed=await createLocalStudioPluginRuntime(env,accountId,{
    mcpFetch:elevated.fetcher,authorizeTool:()=>({allowed:true}),requireApproval:()=>true,
  });
  const result=await allowed.execute('campaign.brief.save',{}, {accountId});
  assert.deepEqual(result,{ok:true,tool:'campaign.brief.save'});
  sqlite.close();
});
