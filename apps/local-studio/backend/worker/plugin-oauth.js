/** Studio-owned public MCP OAuth 2.1 PKCE broker. No OAuth credentials enter the WebView. */
import { importVaultMasterKey, encryptVaultSecret, decryptVaultSecret } from '../../../../packages/agentsam-vault/src/index.js';
import { discoverPublicPlugins, fetchPluginResource } from './plugin-discovery.js';
import { listRemoteMcpTools, callRemoteMcpTool } from './plugin-mcp-client.js';

const MAX_JSON=48_000;
const now=()=>Math.floor(Date.now()/1000);
const bytes=()=>crypto.getRandomValues(new Uint8Array(32));
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function digest(value){
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
}
function fail(code){const error=new Error(code);error.code=code;throw error}
const aadState=(owner,hash)=>owner+':agentsam-mcp-oauth:'+hash;
const aadGrant=(owner,id)=>owner+':agentsam-mcp-oauth:'+id;
const boundFetch=(env,fetcher)=>(url,options={})=>fetchPluginResource(env,url,options,fetcher);
async function seal(env,value,aad) {
  return encryptVaultSecret(await importVaultMasterKey(env.VAULT_MASTER_KEY),JSON.stringify(value),aad);
}
async function unseal(env,payload,aad) {
  return JSON.parse(await decryptVaultSecret(await importVaultMasterKey(env.VAULT_MASTER_KEY),payload,aad));
}
async function httpJson(url,options={},fetcher=fetch){
  // Cloudflare Workers does not support redirect:'error'; fail closed on manual redirects.
  const response=await fetcher(url,{...options,redirect:'manual',signal:AbortSignal.timeout(10000)});
  if((response.status>=300&&response.status<400)||response.type==='opaqueredirect')fail('plugin_oauth_redirect_rejected');
  if(Number(response.headers.get('content-length')||0)>MAX_JSON)fail('plugin_oauth_response_too_large');
  const body=await response.text();
  if(body.length>MAX_JSON)fail('plugin_oauth_response_too_large');
  let parsed;try{parsed=JSON.parse(body)}catch{fail('plugin_oauth_invalid_json')}
  if(!response.ok)fail('plugin_oauth_upstream_'+response.status);
  return parsed;
}
/** Trust the first-party plugin resource's own advertised OAuth issuer. */
async function oauthServer(resource,fetcher=fetch){
  let origin;
  try{
    const parsed=new URL(resource);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.hash||parsed.search)fail('plugin_oauth_resource_invalid');
    origin=parsed.origin;
  }catch{fail('plugin_oauth_resource_invalid')}
  const resourceMeta=await httpJson(origin+'/.well-known/oauth-protected-resource',{
    headers:{accept:'application/json'},
  },fetcher);
  if(resourceMeta.resource!==resource||!Array.isArray(resourceMeta.authorization_servers)
    ||resourceMeta.authorization_servers.length!==1
    ||resourceMeta.authorization_servers[0]!==origin)fail('plugin_oauth_issuer_untrusted');
  const metadata=await httpJson(origin+'/.well-known/oauth-authorization-server',{
    headers:{accept:'application/json'},
  },fetcher);
  if(metadata.issuer!==origin||!metadata.code_challenge_methods_supported?.includes('S256')
    ||!metadata.grant_types_supported?.includes('authorization_code'))fail('plugin_oauth_metadata_invalid');
  for(const key of ['authorization_endpoint','token_endpoint','registration_endpoint','userinfo_endpoint']){
    const endpoint=metadata[key];
    try{if(new URL(endpoint).origin!==origin||new URL(endpoint).protocol!=='https:')fail('plugin_oauth_metadata_invalid')}
    catch{fail('plugin_oauth_metadata_invalid')}
  }
  return {issuer:origin,authorization:metadata.authorization_endpoint,
    token:metadata.token_endpoint,registration:metadata.registration_endpoint,userinfo:metadata.userinfo_endpoint};
}
async function catalogEntry(env,pluginKey,fetcher){
  const catalog=await discoverPublicPlugins(env,fetcher);
  const entry=catalog.plugins.find(item=>item.pluginKey===pluginKey);
  if(!entry)fail('plugin_catalog_entry_not_found');
  const ids=entry.tools;
  if(!entry.oauthResource || !entry.readOnlyScopes?.length || !entry.toolPermissions?.length
    || ids.length!==entry.toolPermissions.length || new Set(entry.toolPermissions.map(p=>p.id)).size!==ids.length
    || entry.toolPermissions.some(p=>!ids.includes(p.id)||!p.scopes?.length||p.requiresApproval===p.readOnly))
    fail('plugin_catalog_permissions_unavailable');
  const all=[...new Set(entry.toolPermissions.flatMap(p=>p.scopes))].sort();
  const read=[...new Set(entry.toolPermissions.filter(p=>p.readOnly).flatMap(p=>p.scopes))].sort();
  if(JSON.stringify(all)!==JSON.stringify([...entry.oauthScopes].sort())
    ||JSON.stringify(read)!==JSON.stringify([...entry.readOnlyScopes].sort()))fail('plugin_catalog_permissions_mismatch');
  return entry;
}
export async function getOwnedCatalogPlugin(db,accountId,pluginId){
  if(!/^plg_[a-z0-9]+$/i.test(pluginId))fail('plugin_id_invalid');
  const row=await db.prepare(
    "SELECT * FROM agentsam_plugins WHERE id = ? AND account_id = ? AND installation_key = 'catalog-v1' LIMIT 1"
  ).bind(pluginId,accountId).first();
  if(!row)fail('plugin_installation_not_found');
  return row;
}
function scopesFor(entry,allowWrites){
  return allowWrites ? entry.oauthScopes : entry.readOnlyScopes;
}
function codeVerifier(){return base64url(bytes())}
async function registerOAuthClient(server,redirectUri,scope,logoUri,fetcher=fetch){
  const response=await httpJson(server.registration,{
    method:'POST',
    headers:{'content-type':'application/json',accept:'application/json'},
    body:JSON.stringify({
      client_name:'AgentSam Studio',
      // The registered OAuth client is Studio, not the requested Brand/Campaign resource.
      // Catalog-verified publisher icon; never accept a caller-supplied logo URL.
      ...(logoUri ? {logo_uri:logoUri} : {}),
      redirect_uris:[redirectUri],
      application_type:'web',
      token_endpoint_auth_method:'none',
      grant_types:['authorization_code','refresh_token'],
      response_types:['code'],
      scope:scope.join(' '),
    }),
  },fetcher);
  if(typeof response.client_id!=='string'||!/^[-A-Za-z0-9._:]{6,250}$/.test(response.client_id))fail('plugin_oauth_registration_invalid');
  return response.client_id;
}
export async function beginPluginOAuth(env,accountId,pluginId,options={},fetcher=fetch){
  const installed=await getOwnedCatalogPlugin(env.DB,accountId,pluginId);
  const entry=await catalogEntry(env,installed.plugin_key,fetcher);
  if(installed.endpoint_url!==entry.endpointUrl)fail('plugin_endpoint_changed_requires_reconnect');
  const scopes=scopesFor(entry,options.allowWrites===true);
  const pluginFetch=boundFetch(env,fetcher);
  const server=await oauthServer(entry.oauthResource,pluginFetch);
  const redirectUri=options.callbackUrl;
  if(typeof redirectUri!=='string'||!redirectUri.startsWith('https://')
    ||new URL(redirectUri).pathname!=='/api/plugins/oauth/callback')fail('plugin_oauth_callback_untrusted');
  const clientId=await registerOAuthClient(server,redirectUri,scopes,entry.publisherIconUrl,pluginFetch);
  const state=codeVerifier();
  const hash=await digest(state);
  const verifier=codeVerifier();
  const challenge=await digest(verifier);
  const sealed=await seal(env,{verifier},aadState(accountId,hash));
  await env.DB.prepare(`INSERT INTO agentsam_plugin_oauth_states (
    state_hash,account_id,plugin_id,client_id,verifier_ciphertext,scopes_json,resource_url,
    redirect_uri,source_client,expires_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
    hash,accountId,pluginId,clientId,sealed,JSON.stringify(scopes),
    entry.oauthResource,redirectUri,options.desktop===true?'desktop':'web',now()+600
  ).run();
  // User identity comes from Studio's verified session (not browser form data).
  // An opaque one-time login_hint conveys the verified Studio account to the
  // independent plugin issuer. No Studio session cookie or OAuth token leaks.
  if(!env.STUDIO_HANDOFF_SECRET || env.STUDIO_HANDOFF_SECRET.length<48)
    fail('plugin_studio_sso_unavailable');
  const identity=await env.DB.prepare(
    'SELECT id,email,display_name FROM accounts WHERE id=? LIMIT 1'
  ).bind(accountId).first();
  if(!identity||identity.id!==accountId)fail('plugin_studio_identity_missing');
  const handoff=await httpJson(server.issuer+'/oauth/studio/handoff',{
    method:'POST',headers:{
      'content-type':'application/json',
      'x-agentsam-studio-handoff-secret':env.STUDIO_HANDOFF_SECRET,
    },
    body:JSON.stringify({
      user_id:accountId,
      display_name:identity.display_name||'AgentSam account',
      email:identity.email||undefined,
      client_id:clientId,redirect_uri:redirectUri,
      resource:entry.oauthResource,scope:scopes.join(' '),
      code_challenge:challenge,state,
    }),
  },pluginFetch);
  if(typeof handoff.login_hint!=='string'||! /^[A-Za-z0-9_-]{40,80}$/.test(handoff.login_hint))
    fail('plugin_studio_handoff_invalid');
  const url=new URL(server.authorization);
  for(const [key,value] of Object.entries({
    client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope:scopes.join(' '),
    resource:entry.oauthResource,state,code_challenge:challenge,code_challenge_method:'S256',
    login_hint:handoff.login_hint,
  }))url.searchParams.set(key,value);
  return {authorize_url:url.toString(),status:'authorization_required',plugin_key:installed.plugin_key};
}
async function exchangeCode(pending,verifier,code,fetcher){
  const server=await oauthServer(pending.resource_url,fetcher);
  return httpJson(server.token,{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'authorization_code',client_id:pending.client_id,code,
      code_verifier:verifier,redirect_uri:pending.redirect_uri,resource:pending.resource_url,
    }).toString(),
  },fetcher);
}
async function identityFor(token,pending,fetcher){
  const server=await oauthServer(pending.resource_url,fetcher);
  const info=await httpJson(server.userinfo,{
    headers:{authorization:'Bearer '+token,accept:'application/json'},
  },fetcher);
  if(typeof info.sub!=='string'||!info.sub||info.audience!==pending.resource_url)fail('plugin_oauth_identity_mismatch');
  const granted=Array.isArray(info.scopes)?info.scopes:[];
  const requested=JSON.parse(pending.scopes_json||'[]');
  if(!requested.every(scope=>granted.includes(scope)))fail('plugin_oauth_scope_missing');
  return granted;
}
function checkedTools(tools,entry,granted){
  const allow=new Map(entry.toolPermissions.map(permission=>[permission.id,permission]));
  const result=[];
  for(const tool of tools){
    const permission=allow.get(tool.name);
    if(!permission)continue; // shared public MCP tools are never registered unless published for this plugin
    const remote=tool?._meta?.securitySchemes?.find(s=>s.type==='oauth2');
    if(!remote||!Array.isArray(remote.scopes)
      ||JSON.stringify([...remote.scopes].sort())!==JSON.stringify([...permission.scopes].sort())
      ||tool.annotations?.readOnlyHint!==permission.readOnly)fail('plugin_oauth_tool_permissions_changed');
    if(!permission.scopes.every(scope=>granted.includes(scope)))continue;
    if(!tool.inputSchema||typeof tool.inputSchema!=='object')fail('plugin_oauth_tool_schema_missing');
    result.push({...tool,permission});
  }
  if(result.length===0)fail('plugin_oauth_no_authorized_tools');
  return result;
}
function toolStatements(db,entry,installed,accountId,tools){
  const statements=[];
  for(const tool of tools){
    const name='remote_'+installed.id+'_'+tool.name.replace(/[^a-z0-9_]/gi,'_');
    const id='ast_'+crypto.randomUUID().replaceAll('-','').slice(0,16);
    const isWrite=!tool.permission.readOnly;
    statements.push(db.prepare(`INSERT INTO agentsam_tools (
      id,account_id,plugin_id,plugin_key,tool_key,tool_name,display_name,tool_category,
      handler_type,description,input_schema,output_schema,handler_config,intent_tags,
      risk_level,requires_approval,requires_confirmation,is_active,connector_visible,
      connector_access_class,dispatch_target,handler_key,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch(),unixepoch())`).bind(
      id,accountId,installed.id,installed.plugin_key,tool.name,name,
      String(tool.title||tool.permission.title||tool.name).slice(0,140),'integrations',
      'mcp',String(tool.description||'').slice(0,700),JSON.stringify(tool.inputSchema),
      tool.outputSchema?JSON.stringify(tool.outputSchema):null,
      JSON.stringify({remote_tool:tool.name,server_url:entry.endpointUrl,required_scopes:tool.permission.scopes}),
      JSON.stringify([installed.plugin_key]),isWrite?'high':'low',
      isWrite?1:0,isWrite?1:0,1,1,isWrite?'write':'read','mcp',tool.name
    ));
  }
  return statements;
}
async function finishAuthorizedConnection(env,pending,payload,fetcher=fetch){
  if(typeof payload.access_token!=='string'||payload.access_token.length<20)fail('plugin_oauth_access_missing');
  const scopes=await identityFor(payload.access_token,pending,boundFetch(env,fetcher));
  const installed=await getOwnedCatalogPlugin(env.DB,pending.account_id,pending.plugin_id);
  const entry=await catalogEntry(env,installed.plugin_key,fetcher);
  if(entry.oauthResource!==pending.resource_url||entry.endpointUrl!==installed.endpoint_url)fail('plugin_oauth_resource_changed');
  const listed=await listRemoteMcpTools(entry.endpointUrl,entry.oauthResource,payload.access_token,
    (url,options)=>fetchPluginResource(env,url,options,fetcher));
  const tools=checkedTools(listed,entry,scopes);
  const until=now()+Math.min(86400,Math.max(60,Number(payload.expires_in||3600)));
  const ciphertext=await seal(env,{
    access_token:payload.access_token,refresh_token:payload.refresh_token||null,
  },aadGrant(pending.account_id,pending.plugin_id));
  const statements=[
    env.DB.prepare('DELETE FROM agentsam_tools WHERE account_id = ? AND plugin_id = ?').bind(pending.account_id,pending.plugin_id),
    ...toolStatements(env.DB,entry,installed,pending.account_id,tools),
    env.DB.prepare(`INSERT INTO agentsam_plugin_oauth_grants (
      account_id,plugin_id,client_id,resource_url,issuer_url,credentials_ciphertext,scopes_json,expires_at
    ) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(account_id,plugin_id) DO UPDATE SET
      client_id=excluded.client_id,resource_url=excluded.resource_url,issuer_url=excluded.issuer_url,
      credentials_ciphertext=excluded.credentials_ciphertext,scopes_json=excluded.scopes_json,
      expires_at=excluded.expires_at,updated_at=unixepoch()`).bind(
      pending.account_id,pending.plugin_id,pending.client_id,pending.resource_url,(await oauthServer(pending.resource_url,boundFetch(env,fetcher))).issuer,
      ciphertext,JSON.stringify(scopes),until
    ),
    env.DB.prepare(`UPDATE agentsam_plugins SET setup_status='connected',
      health_status='healthy',last_health_at=unixepoch(),last_healthy_at=unixepoch(),
      last_error_code=NULL,last_error_message=NULL,is_enabled=1,composer_visible=1,updated_at=unixepoch()
      WHERE id=? AND account_id=? AND installation_key='catalog-v1'`).bind(pending.plugin_id,pending.account_id),
  ];
  await env.DB.batch(statements);
  return {plugin_key:installed.plugin_key,registered_tools:tools.length};
}
export async function completePluginOAuth(env,request,fetcher=fetch){
  const url=new URL(request.url);
  const state=url.searchParams.get('state')||'';
  const code=url.searchParams.get('code')||'';
  if(!/^[A-Za-z0-9_-]{30,90}$/.test(state)||!code||code.length>2048)fail('plugin_oauth_callback_invalid');
  const hash=await digest(state);
  const pending=await env.DB.prepare('SELECT * FROM agentsam_plugin_oauth_states WHERE state_hash = ? AND consumed_at IS NULL LIMIT 1').bind(hash).first();
  if(!pending||pending.expires_at<=now())fail('plugin_oauth_state_invalid');
  const consumed=await env.DB.prepare(`UPDATE agentsam_plugin_oauth_states SET consumed_at=unixepoch()
    WHERE state_hash=? AND consumed_at IS NULL AND expires_at>unixepoch()`).bind(hash).run();
  if(Number(consumed?.meta?.changes||0)!==1)fail('plugin_oauth_state_consumed');
  const {verifier}=await unseal(env,pending.verifier_ciphertext,aadState(pending.account_id,hash));
  const token=await exchangeCode(pending,verifier,code,boundFetch(env,fetcher));
  const connected=await finishAuthorizedConnection(env,pending,token,fetcher);
  return {...connected,source_client:pending.source_client};
}
export async function getRemotePluginToken(env,accountId,pluginId,fetcher=fetch){
  const grant=await env.DB.prepare(
    'SELECT * FROM agentsam_plugin_oauth_grants WHERE account_id=? AND plugin_id=? LIMIT 1'
  ).bind(accountId,pluginId).first();
  if(!grant)fail('plugin_oauth_not_connected');
  const pluginFetch=boundFetch(env,fetcher);
  const server=await oauthServer(grant.resource_url,pluginFetch);
  if(grant.issuer_url!==server.issuer)fail('plugin_oauth_issuer_mismatch');
  const tokens=await unseal(env,grant.credentials_ciphertext,aadGrant(accountId,pluginId));
  if(grant.expires_at>now()+90 && tokens.access_token)return {
    token:tokens.access_token,resource:grant.resource_url,scopes:JSON.parse(grant.scopes_json||'[]'),
  };
  if(!tokens.refresh_token)fail('plugin_oauth_refresh_required');
  const refreshed=await httpJson(server.token,{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'refresh_token',client_id:grant.client_id,
      refresh_token:tokens.refresh_token,resource:grant.resource_url,
    }).toString(),
  },pluginFetch);
  if(typeof refreshed.access_token!=='string')fail('plugin_oauth_refresh_invalid');
  const owner={account_id:accountId,resource_url:grant.resource_url,scopes_json:grant.scopes_json};
  const scopes=await identityFor(refreshed.access_token,owner,pluginFetch);
  const sealed=await seal(env,{
    access_token:refreshed.access_token,
    refresh_token:refreshed.refresh_token||tokens.refresh_token,
  },aadGrant(accountId,pluginId));
  await env.DB.prepare(`UPDATE agentsam_plugin_oauth_grants
    SET credentials_ciphertext=?,scopes_json=?,expires_at=?,updated_at=unixepoch()
    WHERE account_id=? AND plugin_id=?`).bind(
    sealed,JSON.stringify(scopes),
    now()+Math.min(86400,Math.max(60,Number(refreshed.expires_in||3600))),accountId,pluginId
  ).run();
  return {token:refreshed.access_token,resource:grant.resource_url,scopes};
}
export async function runRemotePluginTool(env,accountId,tool,args,fetcher=fetch){
  const installed=await getOwnedCatalogPlugin(env.DB,accountId,tool.plugin_id);
  if(installed.is_enabled!==1||installed.setup_status!=='connected')fail('plugin_oauth_not_connected');
  const metadata=typeof tool.handler_config==='string'?JSON.parse(tool.handler_config||'{}'):(tool.handler_config||{});
  if(metadata.server_url!==installed.endpoint_url||metadata.remote_tool!==tool.tool_key)fail('plugin_oauth_tool_mismatch');
  const grant=await getRemotePluginToken(env,accountId,tool.plugin_id,fetcher);
  const required=Array.isArray(metadata.required_scopes)?metadata.required_scopes:[];
  if(required.length===0||!required.every(scope=>grant.scopes.includes(scope)))fail('plugin_oauth_scope_missing');
  return callRemoteMcpTool(installed.endpoint_url,grant.resource,grant.token,tool.tool_key,args,
    (url,options)=>fetchPluginResource(env,url,options,fetcher));
}
export async function disconnectPublicPlugin(env,accountId,pluginId){
  await getOwnedCatalogPlugin(env.DB,accountId,pluginId);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM agentsam_tools WHERE plugin_id=? AND account_id=?').bind(pluginId,accountId),
    env.DB.prepare('DELETE FROM agentsam_plugin_oauth_grants WHERE plugin_id=? AND account_id=?').bind(pluginId,accountId),
    env.DB.prepare(`UPDATE agentsam_plugins SET setup_status='unconfigured',health_status='unknown',
      is_enabled=0,composer_visible=0,updated_at=unixepoch()
      WHERE id=? AND account_id=? AND installation_key='catalog-v1'`).bind(pluginId,accountId),
  ]);
  return {disconnected:true,pluginId};
}
