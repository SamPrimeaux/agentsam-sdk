/**
 * Portable Settings storage authority: account preferences only.
 * No provider keys, client OAuth secrets, object reads, or write capability are exposed here.
 * R2 / Images / Stream live verification stays in the Cloudflare resources adapter.
 */
const respond=(body,status=200,extra={})=>Response.json(body,{status,headers:{"cache-control":"no-store",...extra}});
const PROVIDERS={
  artifacts_r2:["bucket","publicBaseUrl","prefix"],
  google_drive:["folderId","folderName"],
  s3:["bucket","endpoint","region","prefix"],
  supabase:["bucket","projectUrl"],
  github:["repository","path"],
  opfs:[],
  device_fsa:[],
};
const ALLOWED=new Set(Object.keys(PROVIDERS));
const FORBIDDEN=/secret|token|password|accesskey|privatekey|credential|apikey/i;
const safeObject=(v)=>v && typeof v==="object" && !Array.isArray(v);
function decode(value) {
  try {const v=JSON.parse(String(value||"{}"));return safeObject(v)?v:{};} catch {return {};}
}
function normalizeConfig(provider,config) {
  if(!safeObject(config))return null;
  const out={};
  for(const [key,value] of Object.entries(config)) {
    if(FORBIDDEN.test(key)||!PROVIDERS[provider].includes(key)||typeof value!=="string"||value.length>1024)return null;
    const text=value.trim();
    if(key==="endpoint"||key==="publicBaseUrl"||key==="projectUrl") {
      if(text) {
        try {const url=new URL(text);if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)return null;}
        catch{return null;}
      }
    }
    out[key]=text;
  }
  return out;
}
function visibleConfig(provider,source){
  const out={};const original=decode(source);
  for(const field of PROVIDERS[provider]||[])if(typeof original[field]==="string")out[field]=original[field];
  return out;
}
export async function handleStudioStorageSettings(request,env,accountId) {
  if(!accountId)return respond({ok:false,error:"unauthorized"},401);
  if(!env.DB)return respond({ok:false,error:"database_unavailable"},503);
  if(request.method!=="GET"&&request.method!=="PUT")return respond({ok:false,error:"method_not_allowed"},405,{allow:"GET, PUT"});
  if(request.method==="GET"){
    const preferenceRows=await env.DB.prepare(
      "SELECT provider,is_enabled,is_default,preferences_json,updated_at FROM user_storage_provider_preferences WHERE owner_user_id=?"
    ).bind(accountId).all();
    const preferences=(preferenceRows.results||[]).filter(row=>ALLOWED.has(row.provider)).map(row=>({
      provider:row.provider,
      enabled:row.is_enabled===1,
      isDefault:row.is_default===1,
      config:visibleConfig(row.provider,row.preferences_json),
      updatedAt:row.updated_at,
    }));
    // Connection hints are not capability verification. Never return token bytes or opaque refs.
    // Optional authorization registries may not exist in a standalone local
    // SQLite host. They are hints, never the source of verified storage access.
    const cloudResult=await env.DB.prepare(
      "SELECT provider,status,last_verified_at FROM cloud_provider_connections WHERE owner_account_id=?"
    ).bind(accountId).all().then(value=>({available:true,rows:value.results||[]}),
      ()=>({available:false,rows:[]}));
    const oauthResult=await env.DB.prepare(
      "SELECT provider,COUNT(*) AS grants FROM user_oauth_tokens WHERE account_id=? AND is_active=1 AND revoked_at IS NULL GROUP BY provider"
    ).bind(accountId).all().then(value=>({available:true,rows:value.results||[]}),
      ()=>({available:false,rows:[]}));
    return respond({ok:true,preferences,connectionHints:{
      cloudAvailable:cloudResult.available,oauthAvailable:oauthResult.available,
      cloud:cloudResult.rows.map(x=>({provider:x.provider,status:x.status,lastVerifiedAt:x.last_verified_at})),
      oauth:oauthResult.rows.map(x=>({provider:x.provider,authorizationRecorded:Number(x.grants)>0})),
    }});
  }
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin)return respond({ok:false,error:"origin_not_allowed"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return respond({ok:false,error:"json_content_type_required"},415);
  const input=await request.json().catch(()=>null);
  if(!safeObject(input)||Object.keys(input).some(k=>!["provider","enabled","isDefault","config"].includes(k))||
      typeof input.provider!=="string"||!ALLOWED.has(input.provider)||
      typeof input.enabled!=="boolean"||typeof input.isDefault!=="boolean"||
      (input.isDefault&&!input.enabled))return respond({ok:false,error:"storage_preference_invalid"},400);
  const config=normalizeConfig(input.provider,input.config);
  if(!config)return respond({ok:false,error:"storage_config_invalid"},400);
  const values=[accountId,input.provider,input.enabled?1:0,input.isDefault?1:0,JSON.stringify(config)];
  const write=env.DB.prepare(
    "INSERT INTO user_storage_provider_preferences (owner_user_id,provider,is_enabled,is_default,preferences_json,updated_at) VALUES (?,?,?,?,?,unixepoch()) "+
    "ON CONFLICT(owner_user_id,provider) DO UPDATE SET is_enabled=excluded.is_enabled,is_default=excluded.is_default,preferences_json=excluded.preferences_json,updated_at=excluded.updated_at"
  ).bind(...values);
  if(input.isDefault){
    const clear=env.DB.prepare("UPDATE user_storage_provider_preferences SET is_default=0,updated_at=unixepoch() WHERE owner_user_id=?").bind(accountId);
    await env.DB.batch([clear,write]);
  }else await write.run();
  return respond({ok:true,preference:{provider:input.provider,enabled:input.enabled,isDefault:input.isDefault,config}});
}
