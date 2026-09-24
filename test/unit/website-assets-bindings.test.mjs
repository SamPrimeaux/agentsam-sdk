import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveWebsiteAssets,
  resolveWorkerStaticAssets,
  resolveDb,
  resolveSiteCacheKv,
  suggestWebsiteAssetsBindingScaffold,
  websitePublicKey,
  websitePartialKey,
  WEBSITE_ASSETS_ROLE,
} from '../../apps/local-studio/backend/worker/bindings.js';

function r2Stub() {
  return {
    get: async () => null,
    put: async () => {},
    list: async () => ({ objects: [] }),
    head: async () => null,
    createMultipartUpload: async () => ({}),
  };
}

function kvStub() {
  return {
    get: async () => null,
    put: async () => {},
    getWithMetadata: async () => ({ value: null, metadata: null }),
  };
}

test('resolveWebsiteAssets prefers canonical name then aliases', () => {
  const bucket = r2Stub();
  const a = resolveWebsiteAssets({ SITE_ASSETS: bucket });
  assert.equal(a.name, 'SITE_ASSETS');
  assert.equal(a.role, WEBSITE_ASSETS_ROLE);

  const b = resolveWebsiteAssets({ WEBSITE_ASSETS: bucket, SITE_ASSETS: r2Stub() });
  assert.equal(b.name, 'WEBSITE_ASSETS');
});

test('resolveWorkerStaticAssets only accepts fetch binding', () => {
  assert.equal(resolveWorkerStaticAssets({ ASSETS: r2Stub() }), null);
  const assets = { fetch: async () => new Response('ok') };
  assert.equal(resolveWorkerStaticAssets({ ASSETS: assets }), assets);
});

test('resolveDb and site cache aliases', () => {
  const db = { prepare: () => ({}) };
  assert.equal(resolveDb({ DATABASE: db }).name, 'DATABASE');
  assert.equal(resolveSiteCacheKv({ CMS_CACHE: kvStub() }).name, 'CMS_CACHE');
});

test('key helpers and scaffold', () => {
  assert.equal(websitePublicKey('agentsam-sdk', 'home/index.html'), 'sites/agentsam-sdk/public/home/index.html');
  assert.equal(websitePartialKey('agentsam-sdk', 'header'), 'sites/agentsam-sdk/partials/header.html');
  const tip = suggestWebsiteAssetsBindingScaffold({ detectedBindingName: 'CONTENT' });
  assert.equal(tip.binding, 'CONTENT');
  assert.equal(tip.wrangler_snippet.r2_buckets[0].binding, 'CONTENT');
});
