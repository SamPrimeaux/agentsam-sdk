/**
 * The existing agentsam_mcp_servers registry: platform entries are visible,
 * account-owned entries are editable. Registration is not installation,
 * tool authorization or proof of a healthy MCP handshake.
 */
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const FIELDS='id,server_key,display_name,url,auth_type,is_active,health_status,last_health_at,created_at,updated_at,account_id';
const validName=value=>typeof value==='string'&&value.trim().length>=2&&value.trim().length<=120;
export function validMcpEndpoint(value) {
  if(typeof value!=='string'||value.length>2048)return false;
  try {
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.hash||!u.hostname.includes('.'))return false;
    const host=u.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.test'))return false;
    if(/^\d+\.\d+\.\d+\.\d+$/.test(host)||host.startsWith('[')||host.includes(':'))return false;
    return true;
  }catch{return false;}
}
const display=(row,accountId)=>({
  id:row.id,key:row.account_id===accountId?row.server_key:row.display_name,
  name:row.display_name,url:row.account_id===accountId?row.url:null,
  authType:row.auth_type,enabled:Number(row.is_active)===1,
  health:row.health_status||'unknown',lastCheckedAt:row.last_health_at,
  managed:row.account_id===accountId,readOnly:row.account_id!==accountId,
});
export async function handleStudioMcps(request,env,accountId) {
  if(!accountId)return reply({ok:false,error:'unauthorized'},401);
  const url=new URL(request.url);
  const suffix=url.pathname.slice('/api/settings/mcps'.length);
  const match=/^\/(mcps_[a-z0-9]+)$/i.exec(suffix);
  if(suffix&&!match)return reply({ok:false,error:'mcp_path_invalid'},404);
  const id=match?.[1]||null;
  if(request.method==='GET'&&!id){
    const result=await env.DB.prepare(`SELECT ${FIELDS} FROM agentsam_mcp_servers
      WHERE account_id IS NULL OR account_id=? ORDER BY account_id DESC,display_name COLLATE NOCASE`)
      .bind(accountId).all();
    return reply({ok:true,servers:(result.results||[]).map(row=>display(row,accountId)),
      access:{create:true,update:true,remove:true,toggle:true}});
  }
  if(!['POST','PUT','PATCH','DELETE'].includes(request.method)||
    (request.method==='POST'&&id)||(request.method!=='POST'&&!id))
    return reply({ok:false,error:'method_not_allowed'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)
    return reply({ok:false,error:'origin_not_allowed'},403);
  if(request.method==='DELETE'){
    const result=await env.DB.prepare('DELETE FROM agentsam_mcp_servers WHERE id=? AND account_id=?')
      .bind(id,accountId).run();
    return Number(result.meta?.changes||0)===1?reply({ok:true,deleted:true})
      :reply({ok:false,error:'mcp_not_found_or_protected'},404);
  }
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return reply({ok:false,error:'json_content_type_required'},415);
  const data=await request.json().catch(()=>null);
  if(!data||typeof data!=='object'||Array.isArray(data))
    return reply({ok:false,error:'mcp_invalid'},400);
  if(request.method==='PATCH'){
    if(Object.keys(data).length!==1||typeof data.enabled!=='boolean')
      return reply({ok:false,error:'mcp_enabled_invalid'},400);
    // Registering a URL is not an authenticated connection. Activation requires
    // the plugin OAuth/permission flow and verified MCP tool registration.
    if(data.enabled)return reply({ok:false,error:'mcp_connection_required'},409);
    const result=await env.DB.prepare(`UPDATE agentsam_mcp_servers SET is_active=?,updated_at=unixepoch()
      WHERE id=? AND account_id=?`).bind(0,id,accountId).run();
    return Number(result.meta?.changes||0)===1?reply({ok:true,enabled:data.enabled})
      :reply({ok:false,error:'mcp_not_found_or_protected'},404);
  }
  if(!validName(data.name)||!validMcpEndpoint(data.url)||
    Object.keys(data).some(key=>!['name','url'].includes(key)))
    return reply({ok:false,error:'mcp_validation_failed'},400);
  const name=data.name.trim(), endpoint=data.url.trim();
  if(request.method==='POST'){
    const generated=crypto.randomUUID().replaceAll('-','');
    const newId='mcps_'+generated.slice(0,16);
    await env.DB.prepare(`INSERT INTO agentsam_mcp_servers
      (id,server_key,display_name,url,auth_type,is_active,health_status,account_id)
      VALUES (?,?,?,?,'none',0,'unknown',?)`)
      .bind(newId,'custom-'+generated,name,endpoint,accountId).run();
    return reply({ok:true,server:{id:newId,name,url:endpoint,enabled:false,managed:true}},201);
  }
  const result=await env.DB.prepare(`UPDATE agentsam_mcp_servers SET
    display_name=?,url=?,health_status='unknown',last_health_at=NULL,updated_at=unixepoch()
    WHERE id=? AND account_id=?`).bind(name,endpoint,id,accountId).run();
  return Number(result.meta?.changes||0)===1?reply({ok:true,server:{id,name,url:endpoint}})
    :reply({ok:false,error:'mcp_not_found_or_protected'},404);
}
