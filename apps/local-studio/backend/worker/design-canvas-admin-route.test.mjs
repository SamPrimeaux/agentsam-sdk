import test from 'node:test';
import assert from 'node:assert/strict';
import {serveDesignCanvasAdminRoute} from './design-canvas-admin-route.js';

const origin='https://agentsam.inneranimalmedia.com';
function fixtures(){
  const seen=[];
  const env={ ASSETS:{fetch: async request=>{
    seen.push(new URL(request.url).pathname);
    return new Response('Asset', {status:200,headers:{'content-type':'text/html'}});
  }}};
  return {env,seen};
}
test('unrelated CMS admin routes are left with their current product owner',async()=>{
  const {env}=fixtures();
  assert.equal(await serveDesignCanvasAdminRoute(new Request(origin+'/admin/store'),env,()=>null),null);
  assert.equal(await serveDesignCanvasAdminRoute(new Request(origin+'/apps/ecommerce-cms-agentsam'),env,()=>null),null);
});
test('admin Canvas has a clean stable URL, preserves search on one redirect',async()=>{
  const {env}=fixtures();
  const r=await serveDesignCanvasAdminRoute(new Request(origin+'/admin/design-canvas?scene=1'),env,()=>null);
  assert.equal(r.status,308);
  assert.equal(r.headers.get('location'),origin+'/admin/design-canvas/?scene=1');
});
test('served document and nested stock dependencies share the existing bundle and auth gate',async()=>{
  const {env,seen}=fixtures();let guards=0;
  const guard=()=>{guards++;return null;};
  const root=await serveDesignCanvasAdminRoute(new Request(origin+'/admin/design-canvas/'),env,guard);
  assert.equal(root.status,302);
  assert.equal(root.headers.get('location'),origin+'/canvas?library=sources');
  for(const path of ['/admin/design-canvas/app.js',
    '/admin/design-canvas/sources/stock/design-theme-settings/vendor/react.js']){
    const response=await serveDesignCanvasAdminRoute(new Request(origin+path),env,guard);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
  }
  assert.deepEqual(seen,['/design-canvas/app.js',
    '/design-canvas/sources/stock/design-theme-settings/vendor/react.js']);
  assert.equal(guards,3);
});
test('unauthorized sessions cannot read source or JS via admin URL',async()=>{
  const {env,seen}=fixtures();
  const deny=()=>new Response('Sign in',{status:401});
  const response=await serveDesignCanvasAdminRoute(new Request(origin+'/admin/design-canvas/app.js'),env,deny);
  assert.equal(response.status,401);assert.deepEqual(seen,[]);
});
test('only GET/HEAD are permitted on the Canvas mount',async()=>{
  const {env}=fixtures();
  const response=await serveDesignCanvasAdminRoute(new Request(origin+'/admin/design-canvas/',{method:'POST'}),env,()=>null);
  assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET, HEAD');
});
