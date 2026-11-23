import test from 'node:test';
import assert from 'node:assert/strict';
import { registryScopesForCapability, filterToRegistry, activeGrantedScopes, listProviderScopeOptions, scopesForFullCatalogOptIn, listProviderPluginPacks } from '../src/scope-registry.js';

function envWith(rows, token) {
  return {
    DB: {
      prepare: (sql) => ({
        bind: () => ({
          all: async () => ({ results: rows }),
          first: async () => token,
        }),
      }),
    },
  };
}
const rows = ['images.read', 'images.write', 'stream.read', 'stream.write', 'd1.read', 'workers-r2.read', 'workers-r2.write', 'workers-r2-bucket-item.read', 'workers-r2-bucket-item.write', 'r2-catalog.read'].map((scope) => ({ scope, label: scope, category: 'x' }));

test('capability scopes come from exact declared capability, not a fuzzy registry family', async () => {
  const env = envWith(rows);
  assert.deepEqual(await registryScopesForCapability(env, 'cloudflare.images'), ['images.read', 'images.write']);
  assert.equal(await registryScopesForCapability(env, 'cloudflare.nothing'), null);
  assert.deepEqual(await registryScopesForCapability(env, 'cloudflare.r2'),
    ['workers-r2.read','workers-r2.write','workers-r2-bucket-item.read','workers-r2-bucket-item.write']);
  // A selected R2 capability may not silently acquire r2-catalog.read.
  assert.equal((await registryScopesForCapability(env,'cloudflare.r2')).includes('r2-catalog.read'),false);
  assert.deepEqual(await registryScopesForCapability(env, 'cloudflare.perm.r2-catalog'), ['r2-catalog.read']);
});

test('scopes outside the registry are dropped', async () => {
  const env = envWith(rows);
  assert.deepEqual(await filterToRegistry(env, ['d1.read', 'bogus.write', 'offline_access']), ['d1.read', 'offline_access']);
});

test('active grant scopes are split for additive grants', async () => {
  const env = envWith(rows, { scopes: 'stream.read stream.write' });
  assert.deepEqual(await activeGrantedScopes(env, 'u1'), []);
  assert.deepEqual(await activeGrantedScopes(env, 'u1', 'cloudflare', 'cf_account_1'), ['stream.read', 'stream.write']);
});

import { pluginPackScopes } from '../src/scope-registry.js';
test('pack scopes come from plugin config_json', async () => {
  const env = envWith([{ id:'plg_example', plugin_key: 'user-renamed-pack', config_json: JSON.stringify({pack:true,pack_id:'create',oauth_scopes: ['images.read'], oauth_scopes_edit: ['images.write'] }) }]);
  assert.deepEqual(await pluginPackScopes(env, ['create']), ['images.read', 'images.write']);
  assert.equal(await pluginPackScopes(envWith([]), ['nope']), null);
});

test('D1 scope catalog can expose all 374 active permissions without depending on the smaller code catalog',async()=>{
  const fakeRows=Array.from({length:374},(_,i)=>({
    scope:`new-product-${i}.read`,label:`New product ${i}`,category:'developer',
  }));
  const env=envWith(fakeRows);
  const catalog=await listProviderScopeOptions(env,'cloudflare');
  assert.equal(catalog.length,374);
  assert.deepEqual(await registryScopesForCapability(env,'cloudflare.perm.new-product-373'),['new-product-373.read']);
});
test('a plugin row is not inferred to be a pack unless its registered pack flag and pack_id match',async()=>{
  const env=envWith([
    {plugin_key:'cloudflare-create',config_json:JSON.stringify({oauth_scopes:['images.write']})},
    {plugin_key:'some-other',config_json:JSON.stringify({pack:true,pack_id:'create',oauth_scopes:['stream.read']})},
  ]);
  assert.deepEqual(await pluginPackScopes(env,['create']),['stream.read']);
});

test('Cloudflare full-access opt-in requests all 374 live D1 permissions, and only when explicitly selected',async()=>{
  const scopes=Array.from({length:374},(_,i)=>({scope:'cf-product-'+i+'.read',label:'Product',category:'dev'}));
  const env=envWith(scopes);
  assert.equal((await scopesForFullCatalogOptIn(env,['all'])).length,374);
  assert.deepEqual(await scopesForFullCatalogOptIn(env,['create']),[]);
  assert.equal((await scopesForFullCatalogOptIn({},['all'])),null);
});
test('Registered plugin pack discovery keeps catalog entries separate from token grants',async()=>{
  const env=envWith([{id:'plg_1234567890abcdef',plugin_key:'my-custom-pack',
    config_json:JSON.stringify({pack:true,pack_id:'create',oauth_scopes:['images.read'],oauth_scopes_edit:['images.write']})}]);
  assert.deepEqual(await listProviderPluginPacks(env),[{
    plugin_id:'plg_1234567890abcdef',plugin_key:'my-custom-pack',pack_id:'create',
    requested_scopes:['images.read','images.write'],
  }]);
});
