import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAuthorizedCmsSiteCatalog, selectAuthorizedCmsSite } from './site-catalog.mjs';

test('catalog is supplied by authenticated CMS API, not fixtures', async () => {
  let requested;
  const sites = await loadAuthorizedCmsSiteCatalog(async (...args) => {
    requested = args;
    return { ok: true, json: async () => ({ websites: [
      { slug: 'inneranimalmedia', name: 'Inner Animal Media', domain: 'inneranimalmedia.com', page_count: 30 },
      { slug: 'inneranimalmedia', name: 'Duplicate' },
      { slug: '__proto__', name: 'Unsafe' },
      { slug: 'example / test', name: 'Unsafe' },
      { slug: 'storefront', name: '' },
    ] }) };
  });
  assert.equal(requested[0], '/api/cms/websites');
  assert.deepEqual(sites.map((x) => x.slug), ['inneranimalmedia', 'storefront']);
  assert.equal(selectAuthorizedCmsSite(sites, 'unknown').slug, 'inneranimalmedia');
  assert.equal(selectAuthorizedCmsSite(sites, 'storefront').slug, 'storefront');
});

test('unauthorized discovery fails closed', async () => {
  await assert.rejects(loadAuthorizedCmsSiteCatalog(async () => ({ ok: false, status: 401 })), /cms_session_required/);
  await assert.rejects(loadAuthorizedCmsSiteCatalog(async () => ({ ok: true, json: async () => ({}) })), /cms_site_catalog_invalid/);
});
