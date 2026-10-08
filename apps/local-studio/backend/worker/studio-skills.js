/**
 * Per-principal skill registry backed by the existing agentsam_skill D1 table.
 * No tenant, new table, or client-side localStorage authority is introduced.
 */
const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const skillFields='id,name,slash_trigger,description,content_markdown,version,is_active,updated_at';
const validTrigger=value=>typeof value==='string'&&/^\/[a-z0-9][a-z0-9-]{0,48}$/.test(value);
const display=row=>({
  id:row.id,name:row.name,trigger:row.slash_trigger,
  description:row.description,content:row.content_markdown,
  version:row.version,updatedAt:row.updated_at,
});
export async function handleStudioSkills(request,env,accountId) {
  if(!accountId)return reply({ok:false,error:'unauthorized'},401);
  const url=new URL(request.url);
  const suffix=url.pathname.slice('/api/settings/skills'.length);
  const match=/^\/(skill_[a-z0-9_-]+)$/i.exec(suffix);
  if(suffix&& !match)return reply({ok:false,error:'skill_path_invalid'},404);
  const id=match?.[1]||null;
  if(request.method==='GET'&&!id) {
    const list=await env.DB.prepare(`SELECT ${skillFields} FROM agentsam_skill
       WHERE account_id=? AND is_active=1 ORDER BY sort_order ASC,name COLLATE NOCASE ASC LIMIT 300`)
      .bind(accountId).all();
    return reply({ok:true,skills:(list.results||[]).map(display)});
  }
  if(!['POST','PUT','DELETE'].includes(request.method)||
     (request.method==='POST'&&id)||(request.method!=='POST'&&!id))
    return reply({ok:false,error:'method_not_allowed'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)
    return reply({ok:false,error:'origin_not_allowed'},403);
  if(request.method==='DELETE') {
    const changed=await env.DB.prepare(`UPDATE agentsam_skill SET is_active=0,
      updated_at=datetime('now') WHERE id=? AND account_id=? AND is_active=1`)
      .bind(id,accountId).run();
    return Number(changed.meta?.changes||0)===1
      ?reply({ok:true,deleted:true}):reply({ok:false,error:'skill_not_found'},404);
  }
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return reply({ok:false,error:'json_content_type_required'},415);
  const data=await request.json().catch(()=>null);
  if(!data||typeof data!=='object'||Array.isArray(data))
    return reply({ok:false,error:'skill_invalid'},400);
  const name=String(data.name||'').trim();
  const trigger=String(data.trigger||'').trim().toLowerCase();
  const description=String(data.description||'').trim();
  const content=String(data.content||'').trim();
  if(name.length<2||name.length>120||!validTrigger(trigger)||description.length>1000||
     content.length<8||content.length>40000)
    return reply({ok:false,error:'skill_validation_failed'},400);
  try {
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)));
    const checksum=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
    if(request.method==='POST') {
      const newId='skill_'+crypto.randomUUID().replace(/-/g,'');
      await env.DB.prepare(`INSERT INTO agentsam_skill
        (id,account_id,name,slash_trigger,description,content_markdown,content_checksum)
        VALUES (?,?,?,?,?,?,?)`).bind(newId,accountId,name,trigger,description,content,checksum).run();
      return reply({ok:true,skill:{id:newId,name,trigger,description,content}},201);
    }
    const updated=await env.DB.prepare(`UPDATE agentsam_skill SET
      name=?,slash_trigger=?,description=?,content_markdown=?,content_checksum=?,version=version+1,
      updated_at=datetime('now') WHERE id=? AND account_id=? AND is_active=1 AND access_mode='read_write'`)
      .bind(name,trigger,description,content,checksum,id,accountId).run();
    if(Number(updated.meta?.changes||0)!==1)
      return reply({ok:false,error:'skill_not_found_or_read_only'},404);
    return reply({ok:true,skill:{id,name,trigger,description,content}});
  }catch(error){
    const msg=String(error?.message||'');
    if(msg.includes('UNIQUE')||msg.includes('constraint'))
      return reply({ok:false,error:'skill_trigger_conflict'},409);
    console.warn('studio_skill_save_failed',msg.slice(0,140));
    return reply({ok:false,error:'skill_write_unavailable'},503);
  }
}
