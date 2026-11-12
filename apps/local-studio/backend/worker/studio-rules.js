/**
 * Account-owned rules backed by the existing agentsam_rules_document table.
 * Ownership is user_id = the authenticated account; unowned or other accounts'
 * rows are never listed or mutated. What the account may do is derived from the
 * table that is actually installed, not from a constant in the client.
 */
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const REQUIRED=['id','user_id','title','body_markdown','version','is_active','apply_mode','globs','updated_at_epoch'];
const APPLY_MODES=['always','on_request'];
const NO_ACCESS=Object.freeze({create:false,update:false,remove:false,toggle:false});
const FULL_ACCESS=Object.freeze({create:true,update:true,remove:true,toggle:true});
const idPattern=/^[A-Za-z0-9][A-Za-z0-9_:.-]{2,119}$/;
const fields='id,title,body_markdown,version,is_active,apply_mode,globs,updated_at_epoch';
const display=row=>({
  id:row.id,name:row.title,content:row.body_markdown,version:Number(row.version)||1,
  enabled:Number(row.is_active)===1,
  // Stored modes outside the editable set are returned as-is and preserved on save.
  applyMode:String(row.apply_mode||'always'),globs:String(row.globs||''),
  updatedAt:Number(row.updated_at_epoch)||null,
});
/** Capability is a fact about the installed schema, probed per request. */
export async function studioRulesAccess(env) {
  if(!env?.DB?.prepare)return NO_ACCESS;
  try {
    const info=await env.DB.prepare("PRAGMA table_info('agentsam_rules_document')").all();
    const columns=new Set((info.results||[]).map(row=>row.name));
    return REQUIRED.every(name=>columns.has(name))?FULL_ACCESS:NO_ACCESS;
  }catch{return NO_ACCESS;}
}
function validate(data,existingMode) {
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  const name=String(data.name||'').trim();
  const content=String(data.content||'').trim();
  const globs=String(data.globs||'').split(',').map(part=>part.trim()).filter(Boolean).join(',');
  const requested=String(data.applyMode||'always');
  // Keep a stored non-editable mode when the client sends it back unchanged.
  const applyMode=APPLY_MODES.includes(requested)||requested===existingMode?requested:null;
  if(name.length<2||name.length>160||content.length<8||content.length>60000||
     globs.length>1000||!applyMode)return null;
  return {name,content,globs,applyMode};
}
export async function handleStudioRules(request,env,accountId) {
  if(!accountId)return reply({ok:false,error:'unauthorized'},401);
  const url=new URL(request.url);
  const suffix=url.pathname.slice('/api/settings/rules'.length);
  const match=/^\/([^/]+)(\/enabled)?$/.exec(suffix);
  if(suffix&&(!match||!idPattern.test(decodeURIComponent(match[1]))))
    return reply({ok:false,error:'rule_path_invalid'},404);
  const id=match?decodeURIComponent(match[1]):null;
  const toggling=Boolean(match?.[2]);
  const access=await studioRulesAccess(env);
  if(request.method==='GET'&&!id) {
    if(!access.update)return reply({ok:true,rules:[],access});
    const list=await env.DB.prepare(`SELECT ${fields} FROM agentsam_rules_document
       WHERE user_id=? ORDER BY is_active DESC,sort_order ASC,title COLLATE NOCASE ASC LIMIT 300`)
      .bind(accountId).all();
    return reply({ok:true,rules:(list.results||[]).map(display),access});
  }
  if(!['POST','PUT','DELETE'].includes(request.method)||
     (request.method==='POST'&&id)||(request.method!=='POST'&&!id)||
     (toggling&&request.method!=='PUT'))
    return reply({ok:false,error:'method_not_allowed'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)
    return reply({ok:false,error:'origin_not_allowed'},403);
  if(!access.update)return reply({ok:false,error:'rules_unavailable'},503);
  if(request.method==='DELETE') {
    const removed=await env.DB.prepare('DELETE FROM agentsam_rules_document WHERE id=? AND user_id=?')
      .bind(id,accountId).run();
    return Number(removed.meta?.changes||0)===1
      ?reply({ok:true,deleted:true}):reply({ok:false,error:'rule_not_found'},404);
  }
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return reply({ok:false,error:'json_content_type_required'},415);
  const data=await request.json().catch(()=>null);
  if(toggling) {
    if(!data||typeof data.enabled!=='boolean')return reply({ok:false,error:'rule_invalid'},400);
    const changed=await env.DB.prepare(`UPDATE agentsam_rules_document SET is_active=?,
      updated_at_epoch=unixepoch() WHERE id=? AND user_id=?`).bind(data.enabled?1:0,id,accountId).run();
    return Number(changed.meta?.changes||0)===1
      ?reply({ok:true,enabled:data.enabled}):reply({ok:false,error:'rule_not_found'},404);
  }
  if(request.method==='POST') {
    const rule=validate(data,null);
    if(!rule)return reply({ok:false,error:'rule_validation_failed'},400);
    const newId='rule_'+crypto.randomUUID().replace(/-/g,'');
    await env.DB.prepare(`INSERT INTO agentsam_rules_document
      (id,user_id,title,body_markdown,apply_mode,globs,is_active) VALUES (?,?,?,?,?,?,?)`)
      .bind(newId,accountId,rule.name,rule.content,rule.applyMode,rule.globs,data.enabled===false?0:1).run();
    return reply({ok:true,rule:{id:newId,...rule,enabled:data.enabled!==false,version:1}},201);
  }
  const current=await env.DB.prepare('SELECT apply_mode FROM agentsam_rules_document WHERE id=? AND user_id=?')
    .bind(id,accountId).first();
  if(!current)return reply({ok:false,error:'rule_not_found'},404);
  const rule=validate(data,String(current.apply_mode||''));
  if(!rule)return reply({ok:false,error:'rule_validation_failed'},400);
  await env.DB.prepare(`UPDATE agentsam_rules_document SET title=?,body_markdown=?,apply_mode=?,globs=?,
    version=version+1,updated_at_epoch=unixepoch() WHERE id=? AND user_id=?`)
    .bind(rule.name,rule.content,rule.applyMode,rule.globs,id,accountId).run();
  return reply({ok:true,rule:{id,...rule}});
}
