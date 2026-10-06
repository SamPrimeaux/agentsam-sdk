/**
 * Worker-to-Worker CMS delegation, protocol v1.
 *
 * The caller authenticates its IAM user and site membership BEFORE signing.
 * The destination independently verifies a short-lived HMAC over the exact
 * method, path/query, payload digest, actor, project, timestamp and nonce.
 * No browser credential, Cloudflare API token, or personal provider key crosses.
 */
const te = new TextEncoder();
const digestHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2,'0')).join('');
const isActor = (s) => /^au_[a-z0-9_-]{4,}$/i.test(s || '');
const isProject = (s) => /^proj_[a-z0-9_-]{3,}$/i.test(s || '');

export function cmsBridgeCanonical({ timestamp, nonce, actor, project, method, path, digest }) {
  return ['agentsam-cms-bridge-v1', timestamp, nonce, actor, project, method, path, digest].join('\n');
}
async function bodyDigest(request) {
  const bytes = await request.clone().arrayBuffer();
  if (bytes.byteLength > 2_000_000) throw new Error('cms_bridge_payload_too_large');
  return digestHex(await crypto.subtle.digest('SHA-256', bytes));
}
async function mac(secret, canonical) {
  if (!secret || typeof secret !== 'string' || secret.length < 32) throw new Error('cms_bridge_secret_unavailable');
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return digestHex(await crypto.subtle.sign('HMAC', key, te.encode(canonical)));
}
function safeEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}

export async function signCmsBridgeRequest(request, {secret,actor,project,now=Math.floor(Date.now()/1000),nonce=crypto.randomUUID()}={}) {
  if(!isActor(actor)||!isProject(project))throw new Error('cms_bridge_identity_required');
  const url=new URL(request.url);
  const canonical=cmsBridgeCanonical({
    timestamp:String(now),nonce,actor,project,
    method:request.method.toUpperCase(),path:url.pathname+url.search,
    digest:await bodyDigest(request),
  });
  const signature=await mac(secret,canonical);
  return {
    'x-cms-bridge-protocol':'v1',
    'x-cms-bridge-timestamp':String(now),
    'x-cms-bridge-nonce':nonce,
    'x-cms-bridge-actor':actor,
    'x-cms-bridge-project':project,
    'x-cms-bridge-signature':signature,
  };
}
export async function verifyCmsBridgeRequest(request, {secret,expectedProject,now=Math.floor(Date.now()/1000)}={}) {
  const h=request.headers;
  const timestamp=h.get('x-cms-bridge-timestamp')||'';
  const nonce=h.get('x-cms-bridge-nonce')||'';
  const actor=h.get('x-cms-bridge-actor')||'';
  const project=h.get('x-cms-bridge-project')||'';
  const provided=h.get('x-cms-bridge-signature')||'';
  if(h.get('x-cms-bridge-protocol')!=='v1'||!/^\d{10}$/.test(timestamp)||
      Math.abs(now-Number(timestamp))>60||!isActor(actor)||!isProject(project)||
      (expectedProject && project!==expectedProject)||
      !/^[a-f0-9-]{20,80}$/i.test(nonce)||
      !/^[a-f0-9]{64}$/i.test(provided)) return {ok:false,error:'cms_bridge_not_authorized'};
  const url=new URL(request.url);
  const canonical=cmsBridgeCanonical({
    timestamp,nonce,actor,project,
    method:request.method.toUpperCase(),path:url.pathname+url.search,
    digest:await bodyDigest(request),
  });
  const expected=await mac(secret,canonical);
  return safeEqual(expected,provided)
    ? {ok:true,actor,project,nonce,timestamp:Number(timestamp)}
    : {ok:false,error:'cms_bridge_not_authorized'};
}
