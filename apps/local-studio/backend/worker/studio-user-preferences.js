/** Existing agentsam_user_ui_preferences account SSOT. No new settings tables. */
const answer=(payload,status=200)=>Response.json(payload,{status,headers:{"cache-control":"no-store"}});
const defaults={openLastProject:false,showRuntimeReceipts:false};
function decode(value){
 try{
  const object=JSON.parse(String(value||"{}"));
  return object && typeof object==="object" && !Array.isArray(object)?object:{};
 }catch{return {};}
}
function normalize(data){
 return {
  openLastProject:data?.openLastProject===true,
  showRuntimeReceipts:data?.showRuntimeReceipts===true,
 };
}
export async function handleStudioUserPreferences(request,env,accountId){
 if(!accountId)return answer({ok:false,error:"unauthorized"},401);
 if(request.method!=="GET"&&request.method!=="PUT")return answer({ok:false,error:"method_not_allowed"},405);
 if(request.method==="PUT"){
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)
    return answer({ok:false,error:"origin_not_allowed"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))
    return answer({ok:false,error:"json_content_type_required"},415);
 }
 const row=await env.DB.prepare(`SELECT ui_preferences_json FROM agentsam_user_ui_preferences
  WHERE workspace_id='' AND user_id=? LIMIT 1`).bind(accountId).first();
 const existing=decode(row?.ui_preferences_json);
 if(request.method==="GET")
   return answer({ok:true,preferences:normalize(existing.settings_general||defaults)});
 const input=await request.json().catch(()=>null);
 if(!input||typeof input!=="object"||Array.isArray(input)||
   typeof input.openLastProject!=="boolean"||typeof input.showRuntimeReceipts!=="boolean")
   return answer({ok:false,error:"preferences_invalid"},400);
 const next={...existing,settings_general:normalize(input)};
 await env.DB.prepare(`INSERT INTO agentsam_user_ui_preferences
   (workspace_id,user_id,ui_preferences_json,updated_at_unix)
   VALUES ('',?,?,unixepoch())
   ON CONFLICT(workspace_id,user_id) DO UPDATE SET
   ui_preferences_json=excluded.ui_preferences_json,updated_at_unix=unixepoch()`)
  .bind(accountId,JSON.stringify(next)).run();
 return answer({ok:true,preferences:next.settings_general});
}

/** Per-authenticated-user avatar preference. Reuses the existing JSON preferences row. */
function normalizeAccountAvatar(value) {
 if(value == null || value === "") return null;
 if(typeof value !== "string" || value.length > 2048) return undefined;
 const asset = value.trim();
 if(/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(asset) && !asset.includes("..")) return asset;
 try {
  const uri = new URL(asset);
  if(uri.protocol === "https:" && !uri.username && !uri.password) return uri.href;
 } catch {}
 return undefined;
}

export async function handleStudioAccountAvatar(request, env, userId) {
 if(!userId) return answer({ok:false,error:"unauthorized"},401);
 if(!env.DB) return answer({ok:false,error:"database_unavailable"},503);
 if(request.method !== "GET" && request.method !== "PUT") return answer({ok:false,error:"method_not_allowed"},405);
 if(request.method === "PUT") {
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin) return answer({ok:false,error:"origin_not_allowed"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json")) return answer({ok:false,error:"json_content_type_required"},415);
 }
 const row=await env.DB.prepare(`SELECT ui_preferences_json FROM agentsam_user_ui_preferences
  WHERE workspace_id='' AND user_id=? LIMIT 1`).bind(userId).first();
 const existing=decode(row?.ui_preferences_json);
 if(request.method==="GET") return answer({ok:true,avatar_url:normalizeAccountAvatar(existing.account_avatar_url) ?? null});
 const input=await request.json().catch(()=>null);
 if(!input || typeof input!=="object" || Array.isArray(input) || !("avatar_url" in input))
  return answer({ok:false,error:"avatar_invalid"},400);
 const avatar=normalizeAccountAvatar(input.avatar_url);
 if(avatar===undefined) return answer({ok:false,error:"avatar_invalid"},400);
 const next={...existing,account_avatar_url:avatar};
 await env.DB.prepare(`INSERT INTO agentsam_user_ui_preferences
  (workspace_id,user_id,ui_preferences_json,updated_at_unix)
  VALUES ('',?,?,unixepoch())
  ON CONFLICT(workspace_id,user_id) DO UPDATE SET
  ui_preferences_json=excluded.ui_preferences_json,updated_at_unix=unixepoch()`)
  .bind(userId,JSON.stringify(next)).run();
 return answer({ok:true,avatar_url:avatar});
}
