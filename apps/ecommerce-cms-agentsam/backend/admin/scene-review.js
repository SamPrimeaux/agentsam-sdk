/**
 * Owner-facing aviation review. The reviewer gate and first-party R2 proxy
 * require a password. Archived scene files are ALSO reachable through the
 * existing public R2 custom domain: block that external route before claiming
 * the scene contents are fully private.
 */
import { hashPassword, verifyPassword, parseCookies } from "../lib/auth.js";
import { saveSceneReviewSettings } from "./store.js";

const PREFIX="/review/bridge-fly";
const COOKIE="fnf_scene_review";
const AGE=7200;
const enc=new TextEncoder();

function escapeHtml(v){return String(v||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");}
function hex(bytes){return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("");}
function secure(response) {
  const headers=new Headers(response.headers);
  headers.set("cache-control","private, no-store, max-age=0");
  headers.set("x-robots-tag","noindex, nofollow, noarchive");
  headers.set("referrer-policy","no-referrer");
  headers.set("x-content-type-options","nosniff");
  return new Response(response.body,{status:response.status,headers});
}
function document(title,body,status=200){
  const base='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+escapeHtml(title)+'</title></head><body style="margin:0;background:#0c0e13;color:#f7f3ed;font:15px/1.6 system-ui,sans-serif"><main style="max-width:1340px;margin:0 auto;padding:clamp(22px,4vw,44px)">'+body+'</main></body></html>';
  return secure(new Response(base,{status,headers:{"content-type":"text/html; charset=utf-8"}}));
}
function form(error=""){
  return document("FNF · Invitation-only review",'<section style="max-width:520px;margin:8vh auto"><small style="letter-spacing:.17em;color:#ecbd84">FUEL & FREE TIME · AVIATION</small><h1 style="font-size:clamp(2rem,6vw,3.8rem);line-height:1.1">Beyond the apparel.</h1><p>This early interactive scene is being reviewed as possible inspiration for documenting the helicopter restoration. Enter the password shared by the site owner.</p>'+ (error?'<p role="alert" style="color:#ffc48f">'+escapeHtml(error)+'</p>':"")+'<form method="post" action="'+PREFIX+'/unlock" style="display:grid;gap:13px"><label for="review-password">Review password</label><input type="password" required name="password" id="review-password" autocomplete="current-password" style="padding:14px;border-radius:8px;background:white;color:#111;font:inherit"><button type="submit" style="padding:14px;border:0;border-radius:8px;font:700 14px system-ui;background:#e8b987;cursor:pointer">Enter review</button></form><p style="font-size:12px;color:#92959b">A password gate protects this review page. The original archived source must be separately restricted before it is confidential.</p></section>',error?401:200);
}
function reviewer(){
  const body='<header style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;align-items:center;margin-bottom:24px"><div><small style="letter-spacing:.16em;color:#e8b987">FUEL & FREE TIME · EXPERIENCE CONCEPT</small><h1 style="font-size:clamp(2rem,4vw,3.4rem);margin:4px 0">Aviation: The Next Chapter</h1><p style="color:#b8bbc2">Exploring how a real restoration becomes an interactive story.</p></div><a href="/community" style="color:#e8b987">Explore FNF →</a></header>'+
  '<section style="background:#080b13;border:1px solid #313843;border-radius:14px;overflow:hidden"><iframe title="Interactive Golden Gate bridge flyover study" src="'+PREFIX+'/assets/index.html" style="display:block;border:0;width:100%;height:min(75vh,800px)" allowfullscreen loading="eager"></iframe></section>'+
  '<section style="display:grid;gap:10px;margin-top:24px;padding:24px;border:1px solid #313843;border-radius:14px;background:#151922"><small style="color:#e8b987;letter-spacing:.14em">DESIGN REVIEW</small><h2 style="margin:0">What should we build from this?</h2><p>This is the original Golden Gate flyover prototype—not an aircraft restoration model. The 3D movement, controls, and atmosphere are being evaluated as building blocks for a useful experience.</p><ul><li>Follow real helicopter restoration milestones with photos, interviews, and project notes</li><li>Explore an interactive hangar or aircraft walkthrough when verified models exist</li><li>Build an optional cinematic chapter, with accessible reduced-motion alternatives</li></ul><p>Try its controls. Is it understandable? Would it help explain a real build? Which direction should we develop?</p></section>'+
  '<p style="font-size:12px;color:#969aa4">Review prototype · Not linked to live shopping or published as a product</p>';
  return document("FNF · Aviation concept review",body);
}
async function loadConfig(env){
  if (!env.DB) return null;
  try {
    const row=await env.DB.prepare("SELECT settings_json FROM store_settings WHERE id = 1").first();
    return JSON.parse(row?.settings_json||"{}").sceneReview||null;
  } catch {return null;}
}
async function signingKey(config) {
  return crypto.subtle.importKey("raw",enc.encode(config.passwordHash+":"+config.updatedAt),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);
}
async function makeCookie(config,until) {
  const body="v1:"+until;
  const sig=await crypto.subtle.sign("HMAC",await signingKey(config),enc.encode(body));
  return body+":"+hex(sig);
}
async function access(request,config) {
  if (!config?.enabled||!config.passwordHash) return false;
  const m=(parseCookies(request)[COOKIE]||"").match(/^v1:(\d+):([a-f0-9]{64})$/);
  if (!m || Number(m[1])<=Date.now()/1000) return false;
  return crypto.subtle.verify("HMAC",await signingKey(config),Uint8Array.from(m[2].match(/../g),s=>parseInt(s,16)),enc.encode("v1:"+m[1]));
}
async function limitAttempts(env,request) {
  // KV throttling is best effort; production rollout still needs an edge WAF
  // rate-limit rule and private R2 asset access.
  if (!env.CMS_CACHE) return false;
  const ip=request.headers.get("cf-connecting-ip")||"unknown";
  const fingerprint=hex(await crypto.subtle.digest("SHA-256",enc.encode(ip))).slice(0,32);
  const key="fnf:scene-review:attempts:"+fingerprint;
  const count=Number(await env.CMS_CACHE.get(key)||"0");
  if (count>=8) return false;
  await env.CMS_CACHE.put(key,String(count+1),{expirationTtl:3600});
  return true;
}
function deny(status=401){
  return secure(new Response("Review password required",{status,headers:{"content-type":"text/plain"}}));
}
export async function handleSceneReview(request,env,url) {
  const path=url.pathname;
  if (path==="/api/admin/scene-review") {
    if (request.method==="GET") {
      const config=await loadConfig(env);
      return secure(Response.json({ok:true,enabled:config?.enabled===true,hasPassword:!!config?.passwordHash,reviewUrl:PREFIX,assetPrivacyReady:false,updatedAt:config?.updatedAt||null}));
    }
    if (request.method!=="POST") return deny(405);
    const data=await request.json().catch(()=>null);
    if (!data||typeof data!=="object")return secure(Response.json({error:"Invalid request"},{status:400}));
    const prior=await loadConfig(env)||{};
    const pwd=typeof data.password==="string"?data.password:"";
    if (pwd&&(pwd.length<12||pwd.length>128))return secure(Response.json({error:"Use a password between 12 and 128 characters"},{status:400}));
    const enabled=data.enabled===true;
    if (enabled&&!pwd&&!prior.passwordHash)return secure(Response.json({error:"Set a review password first"},{status:400}));
    const pair=pwd?await hashPassword(pwd):null;
    const cfg={enabled,passwordHash:pair?.hash||prior.passwordHash||null,passwordSalt:pair?.salt||prior.passwordSalt||null,updatedAt:new Date().toISOString()};
    try { await saveSceneReviewSettings(env,cfg); }
    catch { return secure(Response.json({error:"Unable to save review settings"},{status:503})); }
    return secure(Response.json({ok:true,enabled,hasPassword:!!cfg.passwordHash,reviewUrl:PREFIX,assetPrivacyReady:false}));
  }
  if (!path.startsWith(PREFIX))return deny(404);
  const config=await loadConfig(env);
  if (!config?.enabled||!config.passwordHash)return document("Not shared yet","<h1>Preview not shared yet</h1><p>The owner has not enabled this concept review.</p>",404);
  if (path===PREFIX&&request.method==="GET")return (await access(request,config))?reviewer():form();
  if (path===PREFIX+"/unlock"&&request.method==="POST"){
    const allowed=await limitAttempts(env,request);
    if (!allowed)return form("Too many attempts. Try again later.");
    const data=await request.formData().catch(()=>null);
    const pwd=String(data?.get("password")||"");
    if (!pwd||pwd.length>128||!(await verifyPassword(pwd,config.passwordHash,config.passwordSalt)))return form("Incorrect password.");
    const until=Math.floor(Date.now()/1000)+AGE;
    // Response.redirect has immutable headers in Workers/Undici. Construct a
    // mutable response before setting the sealed guest session cookie.
    const out=new Response(null,{status:303,headers:{
      location:new URL(PREFIX,request.url).href,
      "set-cookie":COOKIE+"="+(await makeCookie(config,until))+"; Max-Age="+AGE+"; Path="+PREFIX+"; Secure; HttpOnly; SameSite=Lax"
    }});
    return secure(out);
  }
  if (path.startsWith(PREFIX+"/assets/")&&(request.method==="GET"||request.method==="HEAD")){
    if (!await access(request,config))return deny();
    const name=path.slice((PREFIX+"/assets/").length);
    if (!/^[a-zA-Z0-9_.\/-]+$/.test(name)||name.includes("..")||name.startsWith("/"))return deny(404);
    const ext=name.split(".").pop().toLowerCase();
    const types={html:"text/html; charset=utf-8",js:"application/javascript; charset=utf-8",css:"text/css; charset=utf-8",json:"application/json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",svg:"image/svg+xml",webp:"image/webp",glb:"model/gltf-binary",mp4:"video/mp4"};
    if (!types[ext]||!env.WEBSITE_ASSETS)return deny(404);
    const obj=await env.WEBSITE_ASSETS.get("cms/pages/bridge-fly/"+name);
    if (!obj)return deny(404);
    return secure(new Response(request.method==="HEAD"?null:obj.body,{headers:{"content-type":types[ext]}}));
  }
  return deny(405);
}
