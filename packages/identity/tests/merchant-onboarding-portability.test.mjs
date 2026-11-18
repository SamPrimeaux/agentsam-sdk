import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectMerchantOnboarding,serveMerchantOnboarding} from '../src/server/merchant-onboarding.js';

const source='../src/frontend/merchant-onboarding/';
const files={
  'store-start.html':readFileSync(new URL(source+'store-start.html',import.meta.url),'utf8'),
  'store-start.js':readFileSync(new URL(source+'store-start.js',import.meta.url),'utf8'),
  'store-start.css':readFileSync(new URL(source+'store-start.css',import.meta.url),'utf8'),
};
const hostA={
  entry:'/start', identity:{me:'/api/auth/me',login:'/auth/login',signup:'/auth/signup'},
  sites:{list:'/api/cms/sites',create:'/api/cms/sites'},
  destinations:{store:'/admin/store?site_id={site_id}',pages:'/admin/pages?site_id={site_id}',themes:'/admin/store?site_id={site_id}'},
  selectionStorageKey:'agent.cms.site.v1',selectionEvent:'agent:cms-site-changed',branding:{name:'Merchant Builder'},
};
const hostB={
  entry:'/merchant/welcome', identity:{me:'/users/session',login:'/user/sign-in',signup:'/user/register'},
  sites:{list:'/commerce/websites',create:'/commerce/websites'},
  destinations:{store:'/shops/{site_id}/overview',pages:'/shops/{site_id}/content/pages',themes:'/shops/{site_id}/design'},
  siteIdParam:'website_id',selectionStorageKey:'other.cms.selected-site',branding:{name:'White Label Commerce'},
};
function makeAssets() {
  return {async fetch(request) {
    const file=new URL(request.url).pathname.split('/').pop();
    return files[file]?new Response(files[file],{status:200}):new Response('missing',{status:404});
  }};
}

test('portable CMS onboarding mounts at two unrelated host paths and projects distinct identity, site and editor routes', async()=>{
  for (const host of [hostA,hostB]) {
    const url='https://any-merchant-host.invalid'+host.entry;
    const opts={assets:makeAssets(),assetPrefix:'/cms-package/onboarding',config:host};
    const canonical=await serveMerchantOnboarding(new Request(url+'?from=the-shop'),opts);
    assert.equal(canonical.status,308);
    assert.equal(canonical.headers.get('location'),url+'/?from=the-shop');
    const root=await serveMerchantOnboarding(new Request(url+'/'),opts);
    assert.equal(root.status,200);
    assert.match(await root.text(),/src="\.\/store-start\.js"/);
    assert.match(root.headers.get('content-security-policy'),/script-src 'self'/);
    assert.equal(root.headers.get('cache-control'),'private, no-store');
    for (const file of ['store-start.js','store-start.css']) {
      const response=await serveMerchantOnboarding(new Request(url+'/'+file),opts);
      assert.equal(response.status,200,file);
      assert.equal(await response.text(),files[file]);
    }
    const configResponse=await serveMerchantOnboarding(new Request(url+'/config'),opts);
    assert.equal(configResponse.status,200);
    const config=await configResponse.json();
    assert.deepEqual(config.identity,host.identity);
    assert.deepEqual(config.sites,host.sites);
    assert.deepEqual(config.destinations,host.destinations);
    assert.equal(config.entry,host.entry+'/');
    assert.equal(config.branding.name,host.branding.name);
    assert.equal((await serveMerchantOnboarding(new Request(url+'/unknown'),opts)).status,404);
    assert.equal(await serveMerchantOnboarding(new Request('https://any-merchant-host.invalid/unrelated'),opts),null);
  }
});

test('the installed merchant app contains no hardcoded Local Studio auth, API, site or dashboard path',()=>{
  for(const [file,content] of Object.entries(files)) {
    assert.doesNotMatch(content,/\/auth\/(?:login|signup)|\/api\/auth\/me|\/api\/cms\/sites|\/admin\/(?:store|pages)|\/start\b|agentsam\.cms\.selected-site/i,file);
  }
  assert.match(files['store-start.js'],/readJSON\(config\.identity\.me\)/);
  assert.match(files['store-start.js'],/readJSON\(config\.sites\.create/);
  assert.match(files['store-start.js'],/config\.destinations\[kind\]/);
  assert.match(files['store-start.js'],/config\.selectionStorageKey/);
  assert.match(files['store-start.js'],/new URL\('\.\/config'/);
});

test('unsafe or ambiguous host projections fail closed',()=>{
  assert.throws(()=>projectMerchantOnboarding({...hostB,entry:'https://other.example/start'}),/merchant_onboarding_route_invalid/);
  assert.throws(()=>projectMerchantOnboarding({...hostB,identity:{...hostB.identity,login:'//attacker.example/login'}}),/route_invalid/);
  assert.throws(()=>projectMerchantOnboarding({...hostB,destinations:{...hostB.destinations,store:'https://bad.example/{site_id}'}}),/destination_invalid/);
  assert.throws(()=>projectMerchantOnboarding({...hostB,destinations:{...hostB.destinations,store:'/shops/someone-elses-site'}}),/destination_invalid/);
});
