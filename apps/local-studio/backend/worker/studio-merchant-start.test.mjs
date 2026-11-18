import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {serveStudioMerchantStart} from './studio-merchant-start.js';

const origin='https://agentsam.inneranimalmedia.com';
const manifest=JSON.parse(readFileSync(new URL('../../agentsam.app.json',import.meta.url),'utf8'));
const corePath=new URL('../../../../packages/identity/src/frontend/merchant-onboarding/',import.meta.url);
const html=readFileSync(new URL('store-start.html',corePath),'utf8');
const js=readFileSync(new URL('store-start.js',corePath),'utf8');
const css=readFileSync(new URL('store-start.css',corePath),'utf8');
const files={'store-start.html':html,'store-start.js':js,'store-start.css':css};
const path=id=>manifest.routes[id]?.path;
const localConfig={
  entry:path('commerce.merchant.start'),
  identity:{me:path('identity.api.me'),login:path('identity.login'),signup:path('identity.signup')},
  sites:{list:path('commerce.sites'),create:path('commerce.sites')},
  destinations:{store:path('commerce.store')+'?site_id={site_id}',pages:path('commerce.pages')+'?site_id={site_id}',themes:path('commerce.store')+'?site_id={site_id}'},
  selectionStorageKey:'agentsam.cms.selected-site.v1',selectionEvent:'agentsam:cms-site-changed',branding:{name:'InnerAnimalMedia'},
};
const mockEnv=()=>({ASSETS:{async fetch(req){
  const file=new URL(req.url).pathname.split('/').pop();
  return files[file]?new Response(files[file],{status:200}):new Response('Asset missing',{status:404});
}}});

test('host projection mounts Identity-owned onboarding instead of the signed-in shell',async()=>{
  const redirect=await serveStudioMerchantStart(new Request(origin+'/start'),mockEnv(),localConfig);
  assert.equal(redirect.status,308);
  assert.equal(new URL(redirect.headers.get('location')).pathname,'/start/');
  const page=await serveStudioMerchantStart(new Request(origin+'/start/'),mockEnv(),localConfig);
  assert.equal(page.status,200);
  assert.match(await page.text(),/id="start-signup"/);
  assert.equal(page.headers.get('cache-control'),'private, no-store');
  assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
  for(const file of ['store-start.js','store-start.css']) {
    const asset=await serveStudioMerchantStart(new Request(origin+'/start/'+file),mockEnv(),localConfig);
    assert.equal(asset.status,200);
    assert.equal(await asset.text(),files[file]);
  }
  const conf=await serveStudioMerchantStart(new Request(origin+'/start/config'),mockEnv(),localConfig);
  assert.equal(conf.status,200);
  assert.deepEqual((await conf.json()).sites,localConfig.sites);
  assert.equal(await serveStudioMerchantStart(new Request(origin+'/admin/home'),mockEnv(),localConfig),null);
  assert.equal((await serveStudioMerchantStart(new Request(origin+'/start/',{method:'POST'}),mockEnv(),localConfig)).status,405);
  assert.equal((await serveStudioMerchantStart(new Request(origin+'/start/'),{},localConfig)).status,503);
});

test('route authority is the host app manifest, while Identity UI contains no host paths',()=>{
  const host=readFileSync(new URL('../../frontend/public/admin/host-config.js',import.meta.url),'utf8');
  const react=readFileSync(new URL('../../frontend/agentsam/AgentSamShell.tsx',import.meta.url),'utf8');
  const worker=readFileSync(new URL('./index.js',import.meta.url),'utf8');
  const config=readFileSync(new URL('../../backend/wrangler.jsonc',import.meta.url),'utf8');
  assert.match(worker,/serveStudioMerchantStart\(request,env,MERCHANT_ROUTES\)/);
  assert.match(worker,/ROUTE_REGISTRY\.resolve\(APP\.id,'commerce\.merchant\.start'\)/);
  assert.match(config,/"\/start\/\*"/);
  assert.match(js,/config\.identity\.me/);
  assert.match(js,/config\.sites\.list/);
  assert.match(js,/config\.sites\.create/);
  assert.match(js,/config\.destinations/);
  assert.match(host,/function openCreateMerchantStore\(\)/);
  assert.match(react,/onSelect:\(\) => window\.location\.assign\('\/start'\)/);
  assert.doesNotMatch(react,/createStoreOpen|createMerchantStore/);
});
