/** Public merchant setup entry. Identity portal owns authentication, and the
 * existing /api/cms/sites service owns account/site creation. */
export async function serveStudioMerchantStart(request,env) {
  const url=new URL(request.url);
  if(url.pathname!=='/start' && url.pathname!=='/start/')return null;
  if(request.method!=='GET'&&request.method!=='HEAD') {
    return new Response('Method not allowed',{status:405,headers:{allow:'GET, HEAD','cache-control':'private, no-store'}});
  }
  if(!env.ASSETS?.fetch)return new Response('Merchant setup unavailable',{status:503});
  const docUrl=new URL('/store-start.html',url);
  const asset=await env.ASSETS.fetch(new Request(docUrl,{method:request.method,headers:{accept:'text/html'}}));
  if(!asset.ok)return new Response('Merchant setup unavailable',{status:503,headers:{'cache-control':'no-store'}});
  const headers=new Headers(asset.headers);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','private, no-store');
  headers.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
  headers.set('x-content-type-options','nosniff');
  return new Response(request.method==='HEAD'?null:asset.body,{status:asset.status,headers});
}
