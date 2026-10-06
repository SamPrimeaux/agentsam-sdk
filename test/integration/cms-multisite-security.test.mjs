import test from 'node:test';
import assert from 'node:assert/strict';
import { signCmsBridgeRequest, verifyCmsBridgeRequest, isAllowedStudioCmsBridgeRoute } from '../../apps/ecommerce-cms-agentsam/backend/cms/studio-bridge-protocol.js';
import { listAuthorizedCmsSites, requireCmsSiteAccess } from '../../apps/local-studio/backend/worker/cms-authority.js';
import { handleRemoteCmsRequest } from '../../apps/local-studio/backend/worker/cms-remote.js';
import { handleStudioCmsBridge } from '../../apps/ecommerce-cms-agentsam/backend/cms/studio-bridge.js';
import { createRemoteThemeEditorAdapter } from '../../apps/ecommerce-cms-agentsam/frontend/theme-editor/remote-worker-adapter.mjs';

const SECRET = 'cms-test-' + 'c'.repeat(48);
const ACCOUNT = 'au_testaccount123';
const PROJECT = 'proj_fuelnfreetime';
const site = Object.freeze({ id: PROJECT, slug: 'fuelnfreetime', project_id: PROJECT,
  name: 'Fuel & Free Time', tenant_id: 'tenant_test', source: 'worker',
  worker_id: 'fuelnfreetime', can_edit: true, can_publish: true, role: 'owner' });

function fakeDb(rows) {
  return { prepare(sql) {
    assert.match(sql, /JOIN tenants/);
    assert.match(sql, /account_id = \?/);
    assert.match(sql, /project_permissions/);
    return { bind(...args) {
      assert.ok(args.length >= 4);
      assert.ok(args.every((arg) => arg === ACCOUNT));
      return { all: async () => ({ results: rows }) };
    } };
  } };
}
function returnedSite() {
  return {
    project_id: PROJECT, name: site.name, domain: 'fuelnfreetime.com',
    worker_id: 'fuelnfreetime', metadata_json: '{}', tenant_id: 'tenant_test',
    workspace_id: 'ws_test', role: 'owner', cms_slug: null,
  };
}

test('CMS site discovery returns real Worker authority and prevents slug-based impersonation', async () => {
  const opts = { remoteWorkerNames: ['fuelnfreetime'] };
  assert.deepEqual(await listAuthorizedCmsSites(fakeDb([returnedSite()]), ACCOUNT), [], 'no unconfigured workers in catalog');
  const owned = await listAuthorizedCmsSites(fakeDb([returnedSite()]), ACCOUNT, opts);
  assert.equal(owned.length, 1);
  assert.deepEqual(owned[0], { ...site, domain:'fuelnfreetime.com', workspace_id: 'ws_test' });
  assert.equal((await requireCmsSiteAccess(fakeDb([]), ACCOUNT, 'fuelnfreetime')).status, 404);
  assert.equal((await requireCmsSiteAccess(fakeDb([returnedSite()]), ACCOUNT, 'someone-else', 'read', opts)).status, 404);
  assert.equal((await requireCmsSiteAccess(fakeDb([{ ...returnedSite(), role: 'viewer' }]), ACCOUNT, 'fuelnfreetime', 'write', opts)).status, 403);
  assert.equal((await requireCmsSiteAccess(fakeDb([returnedSite()]), ACCOUNT, 'fuelnfreetime', 'publish', opts)).ok, true);
});

test('HMAC binds site, account, path, body, timestamp, and nonce; rejects tampering', async () => {
  const url='https://cms-worker.internal/api/internal/studio-cms/pages/shop/sections/hero?revision=8';
  const src = new Request(url,{method:'PUT',headers:{'content-type':'application/json'},
    body:JSON.stringify({ content:{headline:'Real editorial text'},expected_version:8 }), duplex:'half'});
  const proof=await signCmsBridgeRequest(src,{secret:SECRET,actor:ACCOUNT,project:PROJECT,now:1810000000,nonce:'12345678-1234-4abc-9abc-123456789abc'});
  const signed=new Request(src,{headers:new Headers([...src.headers,...Object.entries(proof)])});
  assert.equal((await verifyCmsBridgeRequest(signed,{secret:SECRET,expectedProject:PROJECT,now:1810000001})).ok,true);
  const badBody=new Request(url,{method:'PUT',headers:signed.headers,body:JSON.stringify({content:{headline:'Tampered'},expected_version:8}),duplex:'half'});
  assert.equal((await verifyCmsBridgeRequest(badBody,{secret:SECRET,expectedProject:PROJECT,now:1810000001})).ok,false);
  assert.equal((await verifyCmsBridgeRequest(signed,{secret:SECRET,expectedProject:'proj_attacker',now:1810000001})).ok,false);
  assert.equal((await verifyCmsBridgeRequest(signed,{secret:SECRET,expectedProject:PROJECT,now:1810000068})).ok,false);
  assert.equal((await verifyCmsBridgeRequest(signed,{secret:'a'.repeat(40),expectedProject:PROJECT,now:1810000001})).ok,false);
});

test('operation allowlist cannot route orders, settings, warm, or arbitrary paths', () => {
  for (const [tail,method] of [
    ['registry','GET'],['pages','GET'],['pages/shop','GET'],['pages/shop/sections/hero','PUT'],
    ['pages/shop/sections/hero/blocks','POST'],['pages/site/publish','POST'],
  ]) assert.equal(isAllowedStudioCmsBridgeRoute(tail,method),true,tail);
  for (const [tail,method] of [
    ['warm','POST'],['backfill-r2','POST'],['pages/shop','DELETE'],['pages','POST'],
    ['pages/shop/sections/hero','GET'],['pages/shop/sections/hero/blocks/nav-1','PUT'],
    ['pages/shop/../../orders','GET'],['orders','GET'],['pages/shop/publish','GET'],
  ]) assert.equal(isAllowedStudioCmsBridgeRoute(tail,method),false,tail);
});

test('remote gateway delegates signed, allowlisted requests to service binding only', async () => {
  let captured;
  const env={
    AGENTSAM_BRIDGE_KEY: SECRET,
    CMS_SITE_BRIDGES:JSON.stringify({fuelnfreetime:'CMS_FNF'}),
    CMS_FNF:{async fetch(request){
      captured=request;
      const verified=await verifyCmsBridgeRequest(request,{secret:SECRET,expectedProject:PROJECT});
      assert.equal(verified.ok,true);
      return Response.json({ok:true,pages:[{slug:'shop',title:'Shop'}]});
    }},
  };
  const request=new Request('https://agentsam.inneranimalmedia.com/api/cms/remote/pages?site=fuelnfreetime',{method:'GET'});
  const answer=await handleRemoteCmsRequest(request,env,{actorUserId:ACCOUNT,site,path:'pages'});
  assert.equal(answer.status,200);
  assert.equal((await answer.json()).pages[0].slug,'shop');
  assert.equal(new URL(captured.url).pathname,'/api/internal/studio-cms/pages');
  assert.ok(!new URL(captured.url).searchParams.has('site'));
  assert.equal((await handleRemoteCmsRequest(new Request(request.url),{}, {actorUserId:ACCOUNT,site,path:'pages'})).status,503);
  assert.equal((await handleRemoteCmsRequest(new Request(request.url.replace('/pages','/orders')),env,{actorUserId:ACCOUNT,site,path:'orders'})).status,403);
  const publish=new Request('https://agentsam.inneranimalmedia.com/api/cms/remote/pages/shop/publish?site=fuelnfreetime',{method:'POST'});
  const gated=await handleRemoteCmsRequest(publish,env,{actorUserId:ACCOUNT,site,path:'pages/shop/publish'});
  assert.equal(gated.status,409,'real publish must be explicitly enabled after acceptance');
});

test('portable FNF adapter preserves optimistic version on real draft writes', async () => {
  const seen=[];
  const transport=async (url,options={})=>{
    seen.push({url,...options});
    if(url.includes('/registry'))return Response.json({ok:true,pages:{shop:{sections:{hero:{label:'Hero'}}}}});
    if(url.includes('/pages/shop/sections/hero'))return Response.json({ok:true,version:9});
    if(url.includes('/pages/shop'))return Response.json({ok:true,page:{slug:'shop',sections:[{key:'hero',version:8,content:{headline:'Before'}}]}});
    if(url.includes('/pages'))return Response.json({ok:true,pages:[{slug:'shop',title:'Shop'}]});
    return Response.json({ok:false,error:'unknown'}, {status:404});
  };
  const adapter=createRemoteThemeEditorAdapter('fuelnfreetime',transport);
  assert.deepEqual((await adapter.listPages()).map((p)=>p.slug),['shop']);
  assert.equal((await adapter.getPage('shop')).sections[0].version,8);
  assert.equal((await adapter.getRegistry()).pages.shop.sections.hero.label,'Hero');
  const result=await adapter.saveDraft('shop','hero',{headline:'Updated'},8);
  assert.equal(result.version,9);
  const mutation=seen.find((r)=>r.method==='PUT');
  assert.deepEqual(JSON.parse(mutation.body),{content:{headline:'Updated'},expected_version:8});
  await assert.rejects(()=>adapter.publish('shop'),/requires_verified_preview/);
});
