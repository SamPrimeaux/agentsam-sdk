/**
 * Explicit FNF CMS bridge for authenticated service-bound Studio requests.
 * Only /api/admin/cms/ registry/pages operations are exposed. Never invokes
 * generic /api/admin/*, orders, identity, checkout, or customer records.
 */
import { handleAdminCmsApi } from './api.js';
import { onlineStoreOverview } from '../admin/store.js';
import { verifyCmsBridgeRequest, isAllowedStudioCmsBridgeRoute } from './studio-bridge-protocol.js';

const PREFIX='/api/internal/studio-cms/';
const WRITE_METHODS=new Set(['POST','PUT','PATCH','DELETE']);
function error(code,status){return Response.json({ok:false,error:code},{status,headers:{'cache-control':'no-store'}});}

export async function handleStudioCmsBridge(request,env){
  const url=new URL(request.url),method=request.method.toUpperCase();
  if(!url.pathname.startsWith(PREFIX))return error('cms_bridge_route_not_found',404);
  const tail=url.pathname.slice(PREFIX.length);
  if(!isAllowedStudioCmsBridgeRoute(tail,method))return error('cms_bridge_operation_denied',403);
  if(tail.endsWith('/publish') && env.CMS_BRIDGE_PUBLISH_ENABLED !== 'true') {
    return error('cms_publish_requires_verified_preview_and_release_gate',409);
  }
  // Project and actor are HMAC-bound to the IAM-authorized Studio request.
  // CMS_BRIDGE_PROJECT_ID remains an optional additional per-deployment pin.
  if(!env.AGENTSAM_BRIDGE_KEY) return error('cms_bridge_not_configured',503);
  let proof;
  try { proof=await verifyCmsBridgeRequest(request,{secret:env.AGENTSAM_BRIDGE_KEY,expectedProject:env.CMS_BRIDGE_PROJECT_ID}); }
  catch{return error('cms_bridge_not_authorized',401);}
  if(!proof.ok)return error('cms_bridge_not_authorized',401);
  if(WRITE_METHODS.has(method)){
    // Fail closed if nonce migration has not been applied. Unique inserts make
    // retries non-replayable before touching a live CMS page.
    try{
      await env.DB.prepare(
        'INSERT INTO cms_studio_bridge_nonces (nonce, actor_id, project_id, operation, created_at) VALUES (?,?,?,?,?)'
      ).bind(proof.nonce,proof.actor,proof.project,method+' '+tail,proof.timestamp).run();
    }catch{return error('cms_bridge_replay_or_migration_missing',409);}
  }
  // Existing Store Overview is the authority for active installed theme,
  // storefront URL, and site analytics. Same IAM/HMAC gate as CMS writes.
  if(tail==='store/online' && method==='GET') {
    try {
      const overview=await onlineStoreOverview(env);
      const response=new Response(overview.body,overview);
      response.headers.set('cache-control','no-store');
      return response;
    } catch (cause) {
      console.error('cms_store_overview_failed',String(cause?.name||cause));
      return error('cms_store_overview_unavailable',503);
    }
  }
  const adminUrl=new URL('/api/admin/cms/'+tail+url.search,url.origin);
  const headers=new Headers();
  const contentType=request.headers.get('content-type');
  if(contentType)headers.set('content-type',contentType);
  const opts={method,headers};
  if(WRITE_METHODS.has(method))opts.body=request.body;
  try{
    const upstream=await handleAdminCmsApi(new Request(adminUrl,opts),env,adminUrl);
    if(!upstream)return error('cms_bridge_route_not_found',404);
    const response=new Response(upstream.body,upstream);
    response.headers.set('cache-control','no-store');
    return response;
  }catch(e){console.error('cms_bridge_upstream_failed',String(e?.name||e));return error('cms_bridge_upstream_failed',502);}
}
