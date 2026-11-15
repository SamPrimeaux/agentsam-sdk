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


const BUILT_IN_COMPANION_IDS = new Set([
 "geaux", "meaux", "coder", "architect", "engineer", "py", "bella",
]);
const DEFAULT_COMPANION_SETTINGS = Object.freeze({ activeId: "geaux", customCompanions: [] });
const COMPANION_STATES = new Set([
 "idle", "working", "thinking", "attention", "success", "signature", "waiting", "error", "resting", "blinking",
]);

function boundedText(value, max, required = false) {
 if (typeof value !== "string") return required ? undefined : "";
 const text = value.trim();
 if (required && !text) return undefined;
 if (text.length > max) return undefined;
 return text;
}

function normalizeCustomCompanion(value) {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const id = typeof value.id === "string" && /^custom_[a-z0-9-]{8,64}$/.test(value.id) ? value.id : null;
 const name = boundedText(value.name, 48, true);
 const animal = boundedText(value.animal, 48, true);
 const role = boundedText(value.role, 80, true);
 const description = boundedText(value.description, 280, true);
 const personality = boundedText(value.personality, 180);
 const visualNotes = boundedText(value.visualNotes, 400);
 const signatureAction = boundedText(value.signatureAction, 180);
 const imageUrl = normalizeAccountAvatar(value.imageUrl);
 const stateAssets = {};
 if (value.stateAssets != null) {
  if (typeof value.stateAssets !== "object" || Array.isArray(value.stateAssets)) return null;
  for (const [state, assetValue] of Object.entries(value.stateAssets)) {
   if (!COMPANION_STATES.has(state)) return null;
   const asset = normalizeAccountAvatar(assetValue);
   if (asset === undefined) return null;
   if (asset) stateAssets[state] = asset;
  }
 }
 if (!id || !name || !animal || !role || !description || personality === undefined ||
     visualNotes === undefined || signatureAction === undefined || imageUrl === undefined) return null;
 return { id, name, animal, role, description, personality, visualNotes, signatureAction, imageUrl, stateAssets };
}

function normalizeCompanionSettings(value) {
 if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_COMPANION_SETTINGS };
 const customCompanions = [];
 const seen = new Set();
 if (Array.isArray(value.customCompanions)) {
  for (const candidate of value.customCompanions.slice(0, 24)) {
   const companion = normalizeCustomCompanion(candidate);
   if (!companion || seen.has(companion.id)) continue;
   seen.add(companion.id);
   customCompanions.push(companion);
  }
 }
 const requested = typeof value.activeId === "string" ? value.activeId : "";
 const activeId = BUILT_IN_COMPANION_IDS.has(requested) || customCompanions.some(item => item.id === requested)
  ? requested : "geaux";
 return { activeId, customCompanions };
}

/** Account-scoped InnerAnimal companion selection and creation briefs.
 * Uses the existing agentsam_user_ui_preferences JSON SSOT; no new table or migration. */
export async function handleStudioCompanionSettings(request, env, accountId) {
 if (!accountId) return answer({ ok: false, error: "unauthorized" }, 401);
 if (request.method !== "GET" && request.method !== "PUT") return answer({ ok: false, error: "method_not_allowed" }, 405);
 if (!env.DB) return answer({ ok: false, error: "database_unavailable" }, 503);
 if (request.method === "PUT") {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return answer({ ok: false, error: "origin_not_allowed" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return answer({ ok: false, error: "json_content_type_required" }, 415);
 }
 const row = await env.DB.prepare(`SELECT ui_preferences_json FROM agentsam_user_ui_preferences
  WHERE workspace_id='' AND user_id=? LIMIT 1`).bind(accountId).first();
 const existing = decode(row?.ui_preferences_json);
 const current = normalizeCompanionSettings(existing.inneranimal_companions);
 if (request.method === "GET") return answer({ ok: true, settings: current });
 const input = await request.json().catch(() => null);
 if (!input || typeof input !== "object" || Array.isArray(input) ||
     typeof input.activeId !== "string" || !Array.isArray(input.customCompanions) || input.customCompanions.length > 24) {
  return answer({ ok: false, error: "companion_settings_invalid" }, 400);
 }
 const customCompanions = [];
 const seen = new Set();
 for (const candidate of input.customCompanions) {
  const companion = normalizeCustomCompanion(candidate);
  if (!companion || seen.has(companion.id)) return answer({ ok: false, error: "custom_companion_invalid" }, 400);
  seen.add(companion.id);
  customCompanions.push(companion);
 }
 const activeId = input.activeId;
 if (!BUILT_IN_COMPANION_IDS.has(activeId) && !customCompanions.some(item => item.id === activeId)) {
  return answer({ ok: false, error: "active_companion_invalid" }, 400);
 }
 const settings = { activeId, customCompanions };
 const next = { ...existing, inneranimal_companions: settings };
 await env.DB.prepare(`INSERT INTO agentsam_user_ui_preferences
  (workspace_id,user_id,ui_preferences_json,updated_at_unix)
  VALUES ('',?,?,unixepoch())
  ON CONFLICT(workspace_id,user_id) DO UPDATE SET
  ui_preferences_json=excluded.ui_preferences_json,updated_at_unix=unixepoch()`)
  .bind(accountId, JSON.stringify(next)).run();
 return answer({ ok: true, settings });
}
