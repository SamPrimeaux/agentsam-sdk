import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  catalogImageSource,
  serveCatalogImage,
} from '../../apps/ecommerce-cms-agentsam/backend/completeful/images.js';

const BRAND_UI = 'apps/ecommerce-cms-agentsam/frontend/static/js/brand-workspace.js';
const STORE_UI = 'apps/ecommerce-cms-agentsam/frontend/static/store.html';

test('Brand workspace uses the shared parsed adminFetch contract', () => {
  const source = fs.readFileSync(BRAND_UI, 'utf8');
  assert.match(source, /const data = await adminFetch\(path/);
  assert.doesNotMatch(source, /response\.json\(\)/);
  assert.doesNotMatch(source, /!response\.ok/);
});

test('catalog image boundary rejects arbitrary origins', () => {
  assert.equal(
    catalogImageSource('https://example.com/not-provider.jpg'),
    null,
  );
});

test('catalog image proxy requests a real Cloudflare derivative and format-safe cache variant', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  let fetchOptions = null;
  let cachedKey = null;

  globalThis.caches = {
    default: {
      match: async (key) => {
        cachedKey = key;
        return undefined;
      },
      put: async () => {},
    },
  };
  globalThis.fetch = async (_url, options) => {
    fetchOptions = options;
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/avif' },
    });
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  });

  const source =
    'https://jvkydnvdajcfnqysmuwt.supabase.co/storage/v1/object/public/product-images/sample.jpg';
  const request = new Request(
    'https://fuelnfreetime.com/catalog-image?w=320&src=' + encodeURIComponent(source),
    { headers: { accept: 'image/avif,image/webp,image/*' } },
  );
  const waits = [];
  const response = await serveCatalogImage(request, {}, {
    waitUntil(promise) {
      waits.push(promise);
    },
  });
  await Promise.all(waits);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-catalog-image'), 'optimized');
  assert.equal(response.headers.get('x-catalog-width'), '320');
  assert.equal(response.headers.get('vary'), 'Accept');
  assert.equal(fetchOptions.cf.image.width, 320);
  assert.equal(fetchOptions.cf.image.fit, 'scale-down');
  assert.equal(fetchOptions.cf.image.format, 'avif');
  assert.match(cachedKey.url, /fmt=avif/);
});
