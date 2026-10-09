/**
 * Canonical, account-scoped Settings access to existing
 * agentsam_subagent_profile and agentsam_user_policy.
 * One service, shared by browser and Tauri native-session bridge.
 */
const response=(body,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
const fields="id,slug,display_name,description,instructions_markdown,default_model_id,allowed_tool_globs,workspace_id,is_active,access_mode,run_in_background,sandbox_mode,model_reasoning_effort,max_concurrent_threads,max_spawn_depth,tool_profile_key,updated_at,instruction_version";
const parseJson=(value,fallback=[])=>{try{return JSON.parse(value||"[]")}catch{return fallback}};
function fromRow(row,template=false) {
 return {
   id:row.id,slug:row.slug,name:row.display_name,description:row.description||"",
   instructions:row.instructions_markdown||"",modelId:row.default_model_id||"",
   allowedTools:parseJson(row.allowed_tool_globs,[]),
   workspaceId:row.workspace_id||"",active:row.is_active===1,
   readOnly:template||row.access_mode==="read_only",template,
   runInBackground:row.run_in_background===1,sandboxMode:row.sandbox_mode||"workspace-write",
   reasoningEffort:row.model_reasoning_effort||"medium",
   maxConcurrentThreads:row.max_concurrent_threads??6,maxSpawnDepth:row.max_spawn_depth??1,
   toolProfileKey:row.tool_profile_key||null,
   updatedAt:row.updated_at,version:row.instruction_version||1
 };
}
const slugPattern=/^[a-z0-9][a-z0-9-]{0,58}$/;
const idPattern=/^[a-z][a-z0-9_-]{2,90}$/i;
const modelPattern=/^[a-z0-9@][a-z0-9@._:/-]{0,160}$/i;
function validate(body) {
 if(!body||typeof body!=="object"||Array.isArray(body))return null;
 const name=String(body.name||"").trim(),slug=String(body.slug||"").trim().toLowerCase();
 const description=String(body.description||"").trim();
 const instructions=String(body.instructions||"").trim();
 const modelId=String(body.modelId||"").trim();
 const tools=body.allowedTools??[];
 const effort=String(body.reasoningEffort||"medium");
 const sandbox=String(body.sandboxMode||"workspace-write");
 const threads=Number(body.maxConcurrentThreads??6);
 if(name.length<2||name.length>120||!slugPattern.test(slug)||description.length>1600||
   instructions.length<8||instructions.length>32000||
   (modelId&&!modelPattern.test(modelId))||
   !Array.isArray(tools)||tools.length>64||tools.some(t=>typeof t!=="string"||t.length>130||!/^[a-z0-9*_.:/-]+$/i.test(t))||
   !["low","medium","high","extra_high"].includes(effort)||
   !["read-only","workspace-write"].includes(sandbox)||
   !Number.isInteger(threads)||threads<1||threads>12) return null;
 return {name,slug,description,instructions,modelId,tools,effort,sandbox,threads,
   runInBackground:body.runInBackground===true};
}
function mutationsAllowed(request){
 const origin=request.headers.get("origin");
 return !origin||origin===new URL(request.url).origin;
}
async function profiles(request,env,accountId) {
 const path=new URL(request.url).pathname;
 const suffix=path.slice("/api/settings/agents".length);
 const id=suffix.startsWith("/")?suffix.slice(1):null;
 if(id!==null&&!idPattern.test(id))return response({ok:false,error:"agent_id_invalid"},404);
 if(request.method==="GET"&&!id){
   const [owned,platform]=await Promise.all([
    env.DB.prepare(`SELECT ${fields} FROM agentsam_subagent_profile WHERE user_id=? ORDER BY is_active DESC, sort_order ASC, display_name COLLATE NOCASE ASC LIMIT 200`).bind(accountId).all(),
    env.DB.prepare(`SELECT ${fields} FROM agentsam_subagent_profile WHERE user_id='platform' AND is_platform_global=1 AND is_active=1 ORDER BY sort_order ASC, display_name COLLATE NOCASE ASC LIMIT 120`).all(),
   ]);
   return response({ok:true,agents:(owned.results||[]).map(row=>fromRow(row)),
     templates:(platform.results||[]).map(row=>fromRow(row,true))});
 }
 if(!["POST","PUT","DELETE"].includes(request.method)||
  (request.method==="POST"&&id)||(request.method!=="POST"&&!id))
   return response({ok:false,error:"method_not_allowed"},405);
 if(!mutationsAllowed(request))return response({ok:false,error:"origin_not_allowed"},403);
 if(request.method==="DELETE"){
   const r=await env.DB.prepare(`UPDATE agentsam_subagent_profile SET is_active=0,updated_at=datetime('now')
     WHERE id=? AND user_id=? AND access_mode='read_write' AND is_active=1`).bind(id,accountId).run();
   return Number(r.meta?.changes||0)===1?response({ok:true,archived:true}):
     response({ok:false,error:"agent_not_found_or_read_only"},404);
 }
 if(!request.headers.get("content-type")?.startsWith("application/json"))
   return response({ok:false,error:"json_content_type_required"},415);
 const raw=await request.json().catch(()=>null);
 const data=validate(raw);
 if(!data)return response({ok:false,error:"agent_validation_failed"},400);
 try {
   if(request.method==="POST"){
     const newId="asp_"+crypto.randomUUID().replace(/-/g,"");
     await env.DB.prepare(`INSERT INTO agentsam_subagent_profile
       (id,user_id,workspace_id,slug,display_name,description,instructions_markdown,
        default_model_id,allowed_tool_globs,run_in_background,sandbox_mode,
        model_reasoning_effort,max_concurrent_threads,is_active,is_platform_global,access_mode)
       VALUES (?,?, '',?,?,?,?,?,?,?,?,?,?,?,0,'read_write')`)
       .bind(newId,accountId,data.slug,data.name,data.description,data.instructions,
         data.modelId||null,JSON.stringify(data.tools),Number(data.runInBackground),
         data.sandbox,data.effort,data.threads,raw.active===false?0:1).run();
     return response({ok:true,agentId:newId},201);
   }
   const updated=await env.DB.prepare(`UPDATE agentsam_subagent_profile SET
      slug=?,display_name=?,description=?,instructions_markdown=?,default_model_id=?,
      allowed_tool_globs=?,run_in_background=?,sandbox_mode=?,model_reasoning_effort=?,
      max_concurrent_threads=?,is_active=?,instruction_version=instruction_version+1,
      updated_at=datetime('now') WHERE id=? AND user_id=? AND access_mode='read_write'`)
     .bind(data.slug,data.name,data.description,data.instructions,data.modelId||null,
       JSON.stringify(data.tools),Number(data.runInBackground),data.sandbox,data.effort,
       data.threads,raw.active===false?0:1,id,accountId).run();
   return Number(updated.meta?.changes||0)===1?response({ok:true,agentId:id}):
     response({ok:false,error:"agent_not_found_or_read_only"},404);
 }catch(error){
   const msg=String(error?.message||"");
   if(/UNIQUE|constraint/i.test(msg))return response({ok:false,error:"agent_slug_conflict"},409);
   console.warn("agent_settings_write_failed",msg.slice(0,160));
   return response({ok:false,error:"agent_write_unavailable"},503);
 }
}
const POLICY_FIELDS=["allow_subagent_spawn","allow_fanout_execution","max_spawn_depth","require_allowlist_for_mcp"];
function normalizePolicy(raw){
 return {
  allowSubagentSpawn:raw?.allow_subagent_spawn===1,
  allowFanoutExecution:raw?.allow_fanout_execution===1,
  maxSpawnDepth:raw?.max_spawn_depth??1,
  requireAllowlistForMcp:raw?.require_allowlist_for_mcp!==0,
 };
}
async function policy(request,env,accountId){
 if(request.method==="GET"){
   const row=await env.DB.prepare(`SELECT ${POLICY_FIELDS.join(",")} FROM agentsam_user_policy WHERE user_id=? AND workspace_id='' LIMIT 1`).bind(accountId).first();
   return response({ok:true,policy:normalizePolicy(row)});
 }
 if(request.method!=="PUT")return response({ok:false,error:"method_not_allowed"},405);
 if(!mutationsAllowed(request))return response({ok:false,error:"origin_not_allowed"},403);
 if(!request.headers.get("content-type")?.startsWith("application/json"))return response({ok:false,error:"json_content_type_required"},415);
 const raw=await request.json().catch(()=>null);
 if(!raw||typeof raw!=="object"||typeof raw.allowSubagentSpawn!=="boolean"||
    typeof raw.allowFanoutExecution!=="boolean"||typeof raw.requireAllowlistForMcp!=="boolean"||
    !Number.isInteger(raw.maxSpawnDepth)||raw.maxSpawnDepth<1||raw.maxSpawnDepth>5)
     return response({ok:false,error:"agent_policy_invalid"},400);
 await env.DB.prepare(`INSERT INTO agentsam_user_policy
   (user_id,workspace_id,allow_subagent_spawn,allow_fanout_execution,max_spawn_depth,require_allowlist_for_mcp)
   VALUES (?,'',?,?,?,?)
   ON CONFLICT(user_id,workspace_id) DO UPDATE SET
   allow_subagent_spawn=excluded.allow_subagent_spawn,
   allow_fanout_execution=excluded.allow_fanout_execution,
   max_spawn_depth=excluded.max_spawn_depth,
   require_allowlist_for_mcp=excluded.require_allowlist_for_mcp,
   updated_at=datetime('now')`)
  .bind(accountId,Number(raw.allowSubagentSpawn),Number(raw.allowFanoutExecution),
   raw.maxSpawnDepth,Number(raw.requireAllowlistForMcp)).run();
 return response({ok:true,policy:raw});
}
export async function handleStudioAgentSettings(request,env,accountId){
 if(!accountId)return response({ok:false,error:"unauthorized"},401);
 if(!env.DB)return response({ok:false,error:"database_unavailable"},503);
 const path=new URL(request.url).pathname;
 if(path==="/api/settings/agents/policy")return policy(request,env,accountId);
 return profiles(request,env,accountId);
}
