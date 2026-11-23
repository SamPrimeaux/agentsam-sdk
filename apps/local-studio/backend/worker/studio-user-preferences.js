import companionCatalog from '../../../../assets/brand/inneranimal-companions/v1/catalog.json' with { type: 'json' };
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
  WHERE account_id=? LIMIT 1`).bind(accountId).first();
 const existing=decode(row?.ui_preferences_json);
 if(request.method==="GET")
   return answer({ok:true,preferences:normalize(existing.settings_general||defaults)});
 const input=await request.json().catch(()=>null);
 if(!input||typeof input!=="object"||Array.isArray(input)||
   typeof input.openLastProject!=="boolean"||typeof input.showRuntimeReceipts!=="boolean")
   return answer({ok:false,error:"preferences_invalid"},400);
 const next={...existing,settings_general:normalize(input)};
 await env.DB.prepare(`INSERT INTO agentsam_user_ui_preferences
   (account_id,ui_preferences_json,updated_at)
   VALUES (?,?,unixepoch())
   ON CONFLICT(account_id) DO UPDATE SET
   ui_preferences_json=excluded.ui_preferences_json,updated_at=unixepoch()`)
  .bind(accountId,JSON.stringify(next)).run();
 return answer({ok:true,preferences:next.settings_general});
}

/**
 * Account-owned New Tab appearance. Reuses agentsam_user_ui_preferences and
 * preserves general settings, avatar and companion keys on every write.
 * Wallpaper images are user-selected existing assets, not uploaded or fetched
 * by this endpoint.
 */
const NEW_TAB_WALLPAPERS = new Set(['default','aurora','dusk','forest','graphite','photo']);
function normalizeNewTabAppearance(value) {
 const wallpaper = NEW_TAB_WALLPAPERS.has(value?.wallpaper) ? value.wallpaper : 'default';
 const imageUrl = typeof value?.imageUrl === 'string' ? value.imageUrl : null;
 return { wallpaper, imageUrl: wallpaper === 'photo' ? imageUrl : null };
}
function validNewTabImage(value) {
 if (typeof value !== 'string' || !value || value.length > 1600 || /[\x00-\x1f\\"'<>]/.test(value))
   return false;
 if (/^\/(?!\/)/.test(value)) return /^\/(?:media|api\/media|assets|brand)\/[a-zA-Z0-9_./?&=%-]+$/.test(value) && !value.includes('..');
 try {
   const url = new URL(value);
   return url.protocol === 'https:' && !url.username && !url.password;
 } catch { return false; }
}
export async function handleStudioNewTabPreferences(request,env,accountId) {
 if (!accountId) return answer({ok:false,error:'unauthorized'},401);
 if (!env.DB?.prepare) return answer({ok:false,error:'preferences_unavailable'},503);
 if (!['GET','PUT'].includes(request.method)) return answer({ok:false,error:'method_not_allowed'},405);
 if (request.method === 'PUT') {
   if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
     return answer({ok:false,error:'origin_not_allowed'},403);
   if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
     return answer({ok:false,error:'json_content_type_required'},415);
   if (Number(request.headers.get('content-length')) > 2048)
     return answer({ok:false,error:'preferences_invalid'},413);
 }
 const row = await env.DB.prepare('SELECT ui_preferences_json FROM agentsam_user_ui_preferences WHERE account_id = ? LIMIT 1').bind(accountId).first();
 const previous = decode(row?.ui_preferences_json);
 if (request.method === 'GET')
   return answer({ok:true,appearance:normalizeNewTabAppearance(previous.new_tab)});
 const raw = await request.text();
 if (raw.length > 2048) return answer({ok:false,error:'preferences_invalid'},413);
 let input;
 try { input = JSON.parse(raw); } catch { return answer({ok:false,error:'preferences_invalid'},400); }
 if (!input || typeof input !== 'object' || Array.isArray(input) ||
     Object.keys(input).some(key=>!['wallpaper','imageUrl'].includes(key)) ||
     !NEW_TAB_WALLPAPERS.has(input.wallpaper) ||
     (input.wallpaper === 'photo' && !validNewTabImage(input.imageUrl)) ||
     (input.wallpaper !== 'photo' && input.imageUrl != null && input.imageUrl !== ''))
   return answer({ok:false,error:'preferences_invalid'},400);
 const next = normalizeNewTabAppearance(input);
 await env.DB.prepare('INSERT INTO agentsam_user_ui_preferences (account_id,ui_preferences_json,updated_at) ' +
  'VALUES (?,?,unixepoch()) ON CONFLICT(account_id) DO UPDATE SET ' +
  'ui_preferences_json=excluded.ui_preferences_json,updated_at=unixepoch()')
  .bind(accountId,JSON.stringify({...previous,new_tab:next})).run();
 return answer({ok:true,appearance:next});
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
  WHERE account_id=? LIMIT 1`).bind(userId).first();
 const existing=decode(row?.ui_preferences_json);
 if(request.method==="GET") return answer({ok:true,avatar_url:normalizeAccountAvatar(existing.account_avatar_url) ?? null});
 const input=await request.json().catch(()=>null);
 if(!input || typeof input!=="object" || Array.isArray(input) || !("avatar_url" in input))
  return answer({ok:false,error:"avatar_invalid"},400);
 const avatar=normalizeAccountAvatar(input.avatar_url);
 if(avatar===undefined) return answer({ok:false,error:"avatar_invalid"},400);
 const next={...existing,account_avatar_url:avatar};
 await env.DB.prepare(`INSERT INTO agentsam_user_ui_preferences
  (account_id,ui_preferences_json,updated_at)
  VALUES (?,?,unixepoch())
  ON CONFLICT(account_id) DO UPDATE SET
  ui_preferences_json=excluded.ui_preferences_json,updated_at=unixepoch()`)
  .bind(userId,JSON.stringify(next)).run();
 return answer({ok:true,avatar_url:avatar});
}


// The versioned source catalog, not a hand-maintained worker allowlist, declares runtime companions.
const BUILT_IN_COMPANION_IDS = new Set(companionCatalog.companions
 .filter((item) => item.assetStatus === "runtime-ready")
 .map((item) => item.id));
const DEFAULT_COMPANION_SETTINGS = Object.freeze({ activeId: "geaux", secondaryId: null, desktopBuddyEnabled: false, onboarding: null, customCompanions: [] });
// Core states are recommendations, not a closed enum. A safe slug can name any state.
const COMPANION_STATE_SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function boundedText(value, max, required = false) {
 if (typeof value !== "string") return required ? undefined : "";
 const text = value.trim();
 if (required && !text) return undefined;
 if (text.length > max) return undefined;
 return text;
}

function normalizeAnimationStates(value) {
 if (!Array.isArray(value)) return null;
 const animations = [];
  const seenStates = new Set();
  for (const item of value) {
   if (!item || typeof item !== "object" || Array.isArray(item)) return null;
   const animationId = boundedText(item.id, 64, true);
   const label = boundedText(item.label, 64, true);
   const description = boundedText(item.description, 200);
   const src = normalizeAccountAvatar(item.src);
   const fps = item.fps === undefined ? 6 : item.fps;
   const frames = item.frames === undefined ? 1 : item.frames;
   const kind = item.kind || "apng";
   if (!animationId || !COMPANION_STATE_SLUG.test(animationId) ||
       ["constructor", "prototype", "tostring"].includes(animationId.toLowerCase()) ||
       seenStates.has(animationId) || !label || description === undefined || src === undefined ||
       !Number.isInteger(fps) || fps < 1 || fps > 60 ||
       !Number.isInteger(frames) || frames < 1 || frames > 10000 ||
       !["apng", "gif", "spritesheet", "frames", "static"].includes(kind) ||
       (item.loop != null && typeof item.loop !== "boolean")) return null;
   seenStates.add(animationId);
   animations.push({ id: animationId, label, description, src, fps, frames, loop: item.loop !== false, kind });
  }
 return animations;
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
 const brandName = boundedText(value.brandName, 80);
 const commissioningMode = value.commissioningMode === "agency" ? "agency" : "personal";
 const imageUrl = normalizeAccountAvatar(value.imageUrl);
 const animations = value.animations == null ? null : normalizeAnimationStates(value.animations);
 if (value.animations != null && !animations) return null;
 const stateAssets = {};
 if (value.stateAssets != null) {
  if (typeof value.stateAssets !== "object" || Array.isArray(value.stateAssets)) return null;
  for (const [state, assetValue] of Object.entries(value.stateAssets)) {
   if (state.length > 64 || !COMPANION_STATE_SLUG.test(state) ||
       ["constructor", "prototype", "tostring"].includes(state.toLowerCase())) return null;
   const asset = normalizeAccountAvatar(assetValue);
   if (asset === undefined) return null;
   if (asset) stateAssets[state] = asset;
  }
 }
 if (!id || !name || !animal || !role || !description || personality === undefined ||
     visualNotes === undefined || signatureAction === undefined || brandName === undefined || imageUrl === undefined) return null;
 return { id, name, animal, role, description, personality, visualNotes, signatureAction, imageUrl, stateAssets, brandName, commissioningMode,
  ...(animations != null ? { animations } : {}) };
}

/** Account-owned additional animations can extend built-ins without editing packaged art. */
function normalizeBuiltInAnimations(value) {
 if (!Array.isArray(value)) return null;
 const seen = new Set();
 const items = [];
 for (const record of value) {
  const companionId = record?.companionId;
  if (!BUILT_IN_COMPANION_IDS.has(companionId) || seen.has(companionId)) return null;
  const animations = normalizeAnimationStates(record.animations);
  if (!animations) return null;
  seen.add(companionId);
  items.push({ companionId, animations });
 }
 return items;
}

/** Layout presets reference companion art; never use a scene as a source of authorization. */
function normalizeCompanionScene(value, validCompanionIds) {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const id = boundedText(value.id, 76, true);
 const name = boundedText(value.name, 64, true);
 const description = boundedText(value.description, 240);
 const backgroundUrl = normalizeAccountAvatar(value.backgroundUrl);
 if (!id || !/^scene_[a-z0-9-]{8,64}$/.test(id) || !name ||
     description === undefined || backgroundUrl === undefined ||
     !Array.isArray(value.layers) || !value.layers.length) return null;
 const layers = [];
 const seen = new Set();
 for (const layer of value.layers) {
  if (!layer || typeof layer !== "object" || Array.isArray(layer)) return null;
  const layerId = boundedText(layer.id, 76, true);
  const stateId = boundedText(layer.stateId, 64, true);
  if (!layerId || !/^layer_[a-z0-9-]{8,64}$/.test(layerId) || seen.has(layerId) ||
      typeof layer.companionId !== "string" || !validCompanionIds.has(layer.companionId) ||
      !stateId || !COMPANION_STATE_SLUG.test(stateId) ||
      !Number.isFinite(layer.x) || layer.x < 0 || layer.x > 100 ||
      !Number.isFinite(layer.y) || layer.y < 0 || layer.y > 100 ||
      !Number.isFinite(layer.scale) || layer.scale < 0.1 || layer.scale > 3) return null;
  seen.add(layerId);
  layers.push({ id: layerId, companionId: layer.companionId, stateId,
   x: layer.x, y: layer.y, scale: layer.scale });
 }
 return { id, name, description, backgroundUrl, layers };
}

function normalizeCompanionSettings(value) {
 if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_COMPANION_SETTINGS };
 const customCompanions = [];
 const seen = new Set();
 if (Array.isArray(value.customCompanions)) {
  for (const candidate of value.customCompanions) {
   const companion = normalizeCustomCompanion(candidate);
   if (!companion || seen.has(companion.id)) continue;
   seen.add(companion.id);
   customCompanions.push(companion);
  }
 }
 const requested = typeof value.activeId === "string" ? value.activeId : "";
 const activeId = BUILT_IN_COMPANION_IDS.has(requested) || customCompanions.some(item => item.id === requested)
  ? requested : "geaux";
 const requestedSecondary = typeof value.secondaryId === "string" ? value.secondaryId : "";
 const secondaryId = requestedSecondary && requestedSecondary !== activeId &&
  (BUILT_IN_COMPANION_IDS.has(requestedSecondary) || customCompanions.some(item => item.id === requestedSecondary))
  ? requestedSecondary : null;
 const desktopBuddyEnabled = secondaryId !== null && value.desktopBuddyEnabled === true;
 let onboarding = null;
 if (value.onboarding && typeof value.onboarding === "object" && !Array.isArray(value.onboarding)) {
  const completedAt = boundedText(value.onboarding.completedAt, 40, true);
  const recommendedId = boundedText(value.onboarding.recommendedId, 48, true);
  const answers = {};
  for (const key of ["work-style", "problem-style", "notice", "presence"]) {
   const answer = boundedText(value.onboarding.answers?.[key], 48, true);
   if (answer) answers[key] = answer;
  }
  if (completedAt && recommendedId && BUILT_IN_COMPANION_IDS.has(recommendedId) && Object.keys(answers).length === 4) {
   onboarding = { version: "1", completedAt, recommendedId, answers };
  }
 }
 const builtInAnimations = value.builtInAnimations == null ? null : normalizeBuiltInAnimations(value.builtInAnimations);
 const validCompanionIds = new Set([...BUILT_IN_COMPANION_IDS, ...customCompanions.map(item => item.id)]);
 const scenes = [];
 if (Array.isArray(value.scenes)) {
  const seenSceneIds = new Set();
  for (const candidate of value.scenes) {
   const scene = normalizeCompanionScene(candidate, validCompanionIds);
   if (!scene || seenSceneIds.has(scene.id)) continue;
   seenSceneIds.add(scene.id);
   scenes.push(scene);
  }
 }
 return { activeId, secondaryId, desktopBuddyEnabled, onboarding, customCompanions,
  ...(value.scenes != null ? { scenes } : {}),
  ...(builtInAnimations != null ? { builtInAnimations } : {}) };
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
  WHERE account_id=? LIMIT 1`).bind(accountId).first();
 const existing = decode(row?.ui_preferences_json);
 const current = normalizeCompanionSettings(existing.inneranimal_companions);
 if (request.method === "GET") return answer({ ok: true, settings: current });
 const input = await request.json().catch(() => null);
 if (!input || typeof input !== "object" || Array.isArray(input) ||
     typeof input.activeId !== "string" || !Array.isArray(input.customCompanions)) {
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
 if (input.builtInAnimations != null && !normalizeBuiltInAnimations(input.builtInAnimations)) {
  return answer({ ok: false, error: "companion_animations_invalid" }, 400);
 }
 if (input.scenes != null) {
  if (!Array.isArray(input.scenes)) return answer({ ok: false, error: "companion_scenes_invalid" }, 400);
  const allowed = new Set([...BUILT_IN_COMPANION_IDS, ...customCompanions.map(item => item.id)]);
  const seenScenes = new Set();
  for (const candidate of input.scenes) {
   const scene = normalizeCompanionScene(candidate, allowed);
   if (!scene || seenScenes.has(scene.id)) return answer({ ok: false, error: "companion_scene_invalid" }, 400);
   seenScenes.add(scene.id);
  }
 }
 const settings = normalizeCompanionSettings({ ...input, activeId, customCompanions });
 const next = { ...existing, inneranimal_companions: settings };
 await env.DB.prepare(`INSERT INTO agentsam_user_ui_preferences
  (account_id,ui_preferences_json,updated_at)
  VALUES (?,?,unixepoch())
  ON CONFLICT(account_id) DO UPDATE SET
  ui_preferences_json=excluded.ui_preferences_json,updated_at=unixepoch()`)
  .bind(accountId, JSON.stringify(next)).run();
 return answer({ ok: true, settings });
}
