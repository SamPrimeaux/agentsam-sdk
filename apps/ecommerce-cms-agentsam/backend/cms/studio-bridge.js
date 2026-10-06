/**
 * Explicit FNF CMS bridge for authenticated service-bound Studio requests.
 * Only /api/admin/cms/ registry/pages operations are exposed. Never invokes
 * generic /api/admin/*, orders, identity, checkout, or customer records.
 */
import { handleAdminCmsApi } from './api.js';
import { verifyCmsBridgeRequest } from './studio-bridge-protocol.js';

const PREFIX='/api/internal/studio-cms/';
const VALID=/^(?:registry|pages(?:\/[a-z0-9-]+(?:\/(?:sections(?:\/[a-z0-9-]+(?:\/(?:duplicate|move|visibility|blocks(?:\/[a-z0-9-]+(?:\/(?:duplicate|move))?)?)?)?|publish|seed))?)?)?)?)$/i;
const WRITE_METHODS=new Set(['POST','PUT','PATCH','DELETE']);
function error(code,status){return Response.json({ok:false,error:code},{status,headers:{'cache-control':'no-store'}});}

export async function handleStudioCmsBridge(request,env){
  const url=new URL(request.url),method=request.method.toUpperCase();
  if(!url.pathname.startsWith(PREFIX))return error('cms_bridge_route_not_found',404);
  const tail=url.pathname.slice(PREFIX.length);
  if(!VALID.test(tail)||!['GET','POST','PUT','DELETE'].includes(method))return error('cms_bridge_operation_denied',403);
  if((tail==='registry'||tail==='pages')&&method!=='GET')return error('cms_bridge_operation_denied',403);
  if(!env.CMS_BRIDGE_SECRET || !env.CMS_BRIDGE_PROJECT_ID) return error('cms_bridge_not_configured',503);
  let proof;
  try { proof=await verifyCmsBridgeRequest(request,{secret:env.CMS_BRIDGE_SECRET,expectedProject:env.CMS_BRIDGE_PROJECT_ID}); }
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
