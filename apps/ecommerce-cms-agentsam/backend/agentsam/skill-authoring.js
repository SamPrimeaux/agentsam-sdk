/**
 * Authorized private skill creation for the same agentsam_skill registry that
 * powers the CMS AgentSam chat/skill picker. No parallel skills table.
 */
import { requireApplicationAccountId } from "../lib/account-context.js";

const reply = (value, status=200) => Response.json(value, { status, headers:{ "cache-control":"private, no-store" }});
const triggerOk = value => typeof value === "string" && /^\/[a-z0-9][a-z0-9-]{0,48}$/.test(value);
const LIMIT=42000;

export async function createAdminAgentSamSkill(request,env,actor) {
  if(!actor?.id) return reply({ok:false,error:"unauthorized"},401);
  if(request.method!=="POST") return reply({ok:false,error:"method_not_allowed"},405);
  if(request.headers.get("origin")!==new URL(request.url).origin)
    return reply({ok:false,error:"origin_not_allowed"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return reply({ok:false,error:"json_content_type_required"},415);
  if(Number(request.headers.get("content-length")||0)>LIMIT) return reply({ok:false,error:"skill_too_large"},413);
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>LIMIT) return reply({ok:false,error:"skill_too_large"},413);
  let body;
  try{body=JSON.parse(raw);}catch{return reply({ok:false,error:"invalid_json"},400);}
  if(!body||typeof body!=="object"||Array.isArray(body) ||
    Object.keys(body).some(k=>!["name","trigger","description","content"].includes(k)))
    return reply({ok:false,error:"skill_invalid"},400);
  const name=String(body.name||"").trim();
  const trigger=String(body.trigger||"").trim().toLowerCase();
  const description=String(body.description||"").trim();
  const content=String(body.content||"").trim();
  if(name.length<2||name.length>120||!triggerOk(trigger)||
     description.length>1000||content.length<8||content.length>40000)
    return reply({ok:false,error:"skill_validation_failed"},400);
  if(!env.DB?.prepare)return reply({ok:false,error:"skill_storage_unavailable"},503);
  try{
    const accountId=requireApplicationAccountId();
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(content));
    const checksum=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
    const id="skill_"+crypto.randomUUID().replaceAll("-","");
    await env.DB.prepare(`INSERT INTO agentsam_skill
      (id, account_id, name, slash_trigger, description, content_markdown, content_checksum,
       is_published, access_mode, metadata_json)
      VALUES (?,?,?,?,?,?,?,0,'read_write',?)`)
      .bind(id,accountId,name,trigger,description,content,checksum,
        JSON.stringify({source:"agentsam_composer",created_by:actor.id})).run();
    return reply({ok:true,skill:{id,slug:trigger.slice(1),name,description,slash_trigger:trigger,version:1}},201);
  }catch(error){
    const message=String(error?.message||"");
    if(/unique|constraint/i.test(message))return reply({ok:false,error:"skill_trigger_conflict"},409);
    console.warn("agentsam_skill_create_failed",message.slice(0,180));
    return reply({ok:false,error:"skill_write_unavailable"},503);
  }
}
