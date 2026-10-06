/**
 * Explicit FNF CMS bridge for authenticated service-bound Studio requests.
 * Only /api/admin/cms/ registry/pages operations are exposed. Never invokes
 * generic /api/admin/*, orders, identity, checkout, or customer records.
 */
import { handleAdminCmsApi } from './api.js';
import { verifyCmsBridgeRequest } from './studio-bridge-protocol.js';

const PREFIX='/api/internal/studio-cms/';
const SEG=/^[a-z0-9-]+$/i;
export function isAllowedStudioCmsBridgeRoute(tail,method) {
  if(tail==='registry'||tail==='pages')return method==='GET';
  const s=tail.split('/');
  if(s[0]!=='pages'||!SEG.test(s[1]||''))return false;
  const rest=s.slice(2);
  if(rest.length===0)return ['GET','PUT'].includes(method);
  if(rest.length===1&&rest[0]==='publish')return method==='POST';
  if(rest[0]!=='sections')return false;
  if(rest.length===1)return method==='POST';
  if(!SEG.test(rest[1]||''))return false;
  if(rest.length===2)return ['PUT','DELETE'].includes(method);
  if(rest.length===3&&['duplicate','move'].includes(rest[2]))return method==='POST';
  if(rest.length===3&&rest[2]==='visibility')return method==='PUT';
  if(rest[2]!=='blocks')return false;
  if(rest.length===3)return method==='POST';
  if(!SEG.test(rest[3]||''))return false;
  if(rest.length===4)return method==='DELETE';
  if(rest.length===5&&['duplicate','move'].includes(rest[4]))return method==='POST';
  return false;
}
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
