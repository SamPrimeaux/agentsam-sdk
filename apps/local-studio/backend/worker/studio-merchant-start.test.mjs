import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { serveStudioMerchantStart } from './studio-merchant-start.js';

const origin='https://agentsam.inneranimalmedia.com';
const markup=readFileSync(new URL('../../frontend/public/store-start.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../../frontend/public/store-start.js',import.meta.url),'utf8');
const host=readFileSync(new URL('../../frontend/public/admin/host-config.js',import.meta.url),'utf8');
const react=readFileSync(new URL('../../frontend/agentsam/AgentSamShell.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('./index.js',import.meta.url),'utf8');
const config=readFileSync(new URL('../../backend/wrangler.jsonc',import.meta.url),'utf8');
const mockEnv=()=>({ASSETS:{async fetch(req){assert.equal(new URL(req.url).pathname,'/store-start.html');return new Response(markup,{status:200,headers:{'content-type':'text/html'}})}}});

test('public merchant entry is a real separate document, not a dashboard redirect',async()=>{
  const response=await serveStudioMerchantStart(new Request(origin+'/start'),mockEnv());
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.match(response.headers.get('content-security-policy'),/script-src 'self'/);
  assert.match(await response.text(),/id="start-guest"/);
  assert.doesNotMatch(await serveStudioMerchantStart(new Request(origin+'/start',{method:'HEAD'}),mockEnv()).then(async r=>r.text()),/./);
  assert.equal(await serveStudioMerchantStart(new Request(origin+'/admin/home'),mockEnv()),null);
  assert.equal((await serveStudioMerchantStart(new Request(origin+'/start',{method:'POST'}),mockEnv())).status,405);
  assert.equal((await serveStudioMerchantStart(new Request(origin+'/start'),{})).status,503);
  assert.match(worker,/serveStudioMerchantStart\(request,env\)/);
  assert.match(config,/"\/start"/);
});

test('guest signs in or up through owned identity routes and preserves the onboarding destination',()=>{
  assert.match(script,/\/api\/auth\/me/);
  assert.match(script,/\/auth\/signup\?next=/);
  assert.match(script,/\/auth\/login\?next=/);
  assert.match(script,/encodeURIComponent\(safeNext\)/);
  assert.match(markup,/id="start-signup"/);
  assert.match(markup,/id="start-login"/);
  assert.doesNotMatch(markup,/\/admin\/home/);
});

test('merchant onboarding makes site-owned API calls and requires verified returned owner',()=>{
  assert.match(script,/readJSON\('\/api\/cms\/sites'/);
  assert.match(script,/method:'POST'/);
  assert.match(script,/body:JSON\.stringify\(\{name,slug\}\)/);
  assert.match(script,/data\.site\?\.account_id/);
  assert.match(script,/sites\.some\(owned => owned\.id===site\.id\)/);
  assert.match(script,/sessionStorage\.setItem\('agentsam\.cms\.selected-site\.v1'/);
  assert.match(script,/localStorage\.setItem\('agentsam\.cms\.selected-site\.v1'/);
  assert.match(script,/siteLink\('\/admin\/store',site\)/);
  assert.match(script,/siteLink\('\/admin\/pages',site\)/);
  assert.doesNotMatch(script,/primary_domain.*status:'active'/);
});

test('all store creation entrypoints use one first-run onboarding flow',()=>{
  assert.match(host,/function openCreateMerchantStore\(\)\s*\{[\s\S]*?location\.assign\('\/start'\)/);
  assert.match(react,/onSelect:\(\) => window\.location\.assign\('\/start'\)/);
  assert.doesNotMatch(react,/createStoreOpen|createMerchantStore/);
  assert.doesNotMatch(host,/as-store-create-dialog/);
});
