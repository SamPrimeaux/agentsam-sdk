import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  planBrandAssetPromotion,
  publishBrandAssets,
  createBrandAssetManifest,
  validateSvgMark,
  isExcludedIntermediate,
  mayUploadToCloudflareImages,
  inspectLocalAsset,
  brandAssetPrefix,
  resolveKeyLayout,
  MemoryStorageAdapter,
  CloudflareImagesDeliveryAdapter,
  isCloudflareImagesPublished,
  formatPublishReceipt,
  normalizePromotionSpec,
  resolveCloudflareImagesCredentials,
  resolveCloudflareImagesConfig,
  cloudflareImageUrl,
} from '../src/index.js';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('key layout is portable — no product-specific leaf names', () => {
  const keys = resolveKeyLayout({ brand: 'acme', asset: 'app-icon', version: 'v1' });
  assert.equal(keys.prefix, 'brands/acme/app-icon/v1');
  assert.equal(keys.vector.mark, 'brands/acme/app-icon/v1/vector/app-icon-mark.svg');
  assert.equal(keys.source, 'brands/acme/app-icon/v1/source/app-icon-master.png');
});

test('generic brands get portable filenames', () => {
  assert.equal(brandAssetPrefix({ brand: 'FuelNFree', asset: 'Logo', version: 'V2' }), 'brands/fuelnfree/logo/v2');
  const keys = resolveKeyLayout({ brand: 'fuelnfree', asset: 'logo', version: 'v2' });
  assert.equal(keys.vector.mark, 'brands/fuelnfree/logo/v2/vector/logo-mark.svg');
});

test('SVG gate rejects scripts and data rasters; accepts clean mark', () => {
  assert.equal(validateSvgMark('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>').ok, true);
  assert.equal(validateSvgMark('<svg><script>alert(1)</script></svg>').ok, false);
  assert.equal(validateSvgMark('<svg><image href="data:image/png;base64,xx"/></svg>').ok, false);
});

test('intermediates and AgentSam CF Images delivery policy', () => {
  assert.equal(isExcludedIntermediate('/tmp/Mark-trace-92.pbm'), true);
  assert.equal(isExcludedIntermediate('/tmp/Mark-92.min.svg'), false);
  // AgentSam policy: canonical PNG only — not a Cloudflare limitation
  assert.equal(mayUploadToCloudflareImages('image/png'), true);
  assert.equal(mayUploadToCloudflareImages('image/avif'), false);
  assert.equal(mayUploadToCloudflareImages('image/svg+xml'), false);
  assert.equal(mayUploadToCloudflareImages('image/avif', { policy: 'platform' }), true);
  assert.equal(mayUploadToCloudflareImages('image/webp', { policy: 'platform' }), true);
});

test('credential resolution prefers CLOUDFLARE_IMAGES_API_TOKEN; token is opaque', () => {
  const a = resolveCloudflareImagesCredentials({
    CLOUDFLARE_ACCOUNT_ID: 'acct123',
    CLOUDFLARE_IMAGES_ACCOUNT_HASH: 'testAccountHash_xx123',
    CLOUDFLARE_IMAGES_API_TOKEN: 'not-a-prefix-required-token',
    CLOUDFLARE_API_TOKEN: 'broader',
  });
  assert.equal(a.tokenEnv, 'CLOUDFLARE_IMAGES_API_TOKEN');
  assert.equal(a.apiToken, 'not-a-prefix-required-token');
  assert.equal(a.accountHash, 'testAccountHash_xx123');

  const b = resolveCloudflareImagesCredentials({
    CLOUDFLARE_ACCOUNT_ID: 'acct123',
    CLOUDFLARE_API_TOKEN: 'broader-session',
  });
  assert.equal(b.tokenEnv, 'CLOUDFLARE_API_TOKEN');

  const cfg = resolveCloudflareImagesConfig({
    CLOUDFLARE_ACCOUNT_ID: '00000000000000000000000000000000',
    CLOUDFLARE_IMAGES_ACCOUNT_HASH: 'testAccountHash_xx123',
    CLOUDFLARE_IMAGES_API_TOKEN: 'tok',
  });
  assert.equal(cfg.deliveryBase, 'https://imagedelivery.net/testAccountHash_xx123');
  assert.equal(
    cloudflareImageUrl({ accountHash: cfg.accountHash, imageId: '4b2abc', variant: 'public' }),
    'https://imagedelivery.net/testAccountHash_xx123/4b2abc/public',
  );
  // Never invent from R2
  assert.equal(cloudflareImageUrl({ accountHash: '', imageId: 'r2-key' }), null);
});

test('verifyConnection calls Cloudflare — env presence is not authorization', async () => {
  const delivery = new CloudflareImagesDeliveryAdapter({
    accountId: 'acct',
    accountHash: 'hash123',
    apiToken: 'opaque-token',
    fetchImpl: async (url, init) => {
      assert.match(url, /\/images\/v1\/stats$/);
      assert.equal(init.headers.Authorization, 'Bearer opaque-token');
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, result: { count: { current: 1, allowed: 100000 } } }),
      };
    },
  });
  const verify = await delivery.verifyConnection();
  assert.equal(verify.ok, true);
  assert.equal(verify.authorized, true);
  assert.equal(verify.config.account_hash, 'hash123');

  const bad = new CloudflareImagesDeliveryAdapter({
    accountId: 'acct',
    apiToken: 'bad',
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ success: false, errors: [{ message: 'Authentication error' }] }),
    }),
  });
  const denied = await bad.verifyConnection();
  assert.equal(denied.authorized, false);
  assert.equal(denied.configured, true);
});

test('R2-only plan: delivery null, no image_id, no cloudflare-images claim', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-r2-only-'));
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, FIXTURE_PNG);

  const plan = await planBrandAssetPromotion({
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
    source: png,
    destinations: {
      storage: { provider: 'cloudflare-r2', binding: 'WEBSITE_ASSETS', bucket: 'agentsam-os-blueprint-content' },
      delivery: null,
    },
  });

  assert.equal(plan.destinations.delivery, null);
  assert.equal(plan.destinations.storage.provider, 'cloudflare-r2');
  assert.equal(plan.manifest_draft.delivery, null);
  assert.ok(!plan.manifest_draft.cloudflare_images);
  assert.ok(!('image_id' in (plan.manifest_draft.delivery || {})));
  assert.equal(plan.would_write.delivery_candidates, 0);
});

test('local/memory destinations never invent WEBSITE_ASSETS', () => {
  const local = normalizePromotionSpec({
    brand: 'acme',
    asset: 'logo',
    destinations: { storage: { provider: 'filesystem' }, delivery: null },
  });
  assert.equal(local.destinations.storage.provider, 'filesystem');
  assert.ok(!JSON.stringify(local).includes('WEBSITE_ASSETS'));

  const mem = normalizePromotionSpec({
    brand: 'acme',
    asset: 'logo',
    destinations: { storage: { provider: 'memory' }, delivery: null },
  });
  assert.equal(mem.destinations.storage.provider, 'memory');
  assert.ok(!JSON.stringify(mem).includes('WEBSITE_ASSETS'));
});

test('Cloudflare Images dry run: status planned, no fake image id', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-cf-dry-'));
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, FIXTURE_PNG);

  const delivery = new CloudflareImagesDeliveryAdapter({
    accountId: 'acct',
    apiToken: 'tok',
    fetchImpl: async () => {
      throw new Error('network should not be called in dry run');
    },
  });

  const storage = new MemoryStorageAdapter();
  // Seed a receipt via promote path: plan then publish dry-run
  const plan = await planBrandAssetPromotion({
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
    source: png,
  }, { deliveryAdapter: delivery });

  const receiptDir = path.join(dir, '.agentsam', 'brand', 'assets', 'acme', 'app-icon', 'v1');
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(path.join(receiptDir, 'promotion.json'), `${JSON.stringify(plan)}\n`);

  const published = await publishBrandAssets({
    cwd: dir,
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
    dryRun: true,
    storageAdapter: storage,
    deliveryAdapter: delivery,
  });

  assert.equal(published.overall, 'planned');
  assert.equal(published.delivery.status, 'planned');
  assert.equal(published.delivery.provider_receipt, null);
  assert.equal(isCloudflareImagesPublished(published.delivery), false);
  assert.equal(published.manifest.delivery.provider_asset_id, null);
  assert.equal(published.manifest.delivery.status, 'planned');
});

test('Cloudflare Images successful publish records real id + variants only', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-cf-ok-'));
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, FIXTURE_PNG);

  const fakeId = '01abccloudflareimagesid';
  const variants = [
    `https://imagedelivery.net/hash/${fakeId}/public`,
    `https://imagedelivery.net/hash/${fakeId}/thumbnail`,
  ];
  const delivery = new CloudflareImagesDeliveryAdapter({
    accountId: 'acct',
    accountHash: 'testAccountHash_xx123',
    apiToken: 'tok',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          id: fakeId,
          filename: 'icon.png',
          uploaded: '2026-09-25T00:00:00.000Z',
          variants,
        },
      }),
    }),
  });

  const storage = new MemoryStorageAdapter();
  const plan = await planBrandAssetPromotion({
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
    source: png,
    destinations: {
      storage: { provider: 'memory' },
      delivery: { provider: 'cloudflare-images' },
    },
  }, { deliveryAdapter: delivery });

  const receiptDir = path.join(dir, '.agentsam', 'brand', 'assets', 'acme', 'app-icon', 'v1');
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(path.join(receiptDir, 'promotion.json'), `${JSON.stringify(plan)}\n`);

  const published = await publishBrandAssets({
    cwd: dir,
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
    dryRun: false,
    storageAdapter: storage,
    deliveryAdapter: delivery,
  });

  assert.equal(published.overall, 'success');
  assert.equal(published.delivery.provider, 'cloudflare-images');
  assert.equal(published.delivery.status, 'published');
  assert.equal(published.delivery.provider_receipt.provider_asset_id, fakeId);
  assert.equal(published.delivery.provider_receipt.account_id, 'acct');
  assert.equal(published.delivery.provider_receipt.account_hash, 'testAccountHash_xx123');
  assert.equal(
    published.delivery.provider_receipt.delivery_base,
    'https://imagedelivery.net/testAccountHash_xx123',
  );
  assert.deepEqual(published.delivery.provider_receipt.variants, variants);
  assert.equal(isCloudflareImagesPublished(published.delivery), true);
  assert.equal(published.manifest.delivery.provider_asset_id, fakeId);
  assert.equal(published.manifest.delivery.account_hash, 'testAccountHash_xx123');
  assert.equal(published.manifest.delivery.status, 'published');
  // R2 key ≠ Images id
  const storageKey = published.uploaded[0]?.key;
  assert.ok(storageKey);
  assert.notEqual(storageKey, fakeId);
  assert.equal(published.manifest.delivery.source.key, storageKey);
});

test('HTTP 200 without result.id fails — never downgrades to success', async () => {
  const delivery = new CloudflareImagesDeliveryAdapter({
    accountId: 'acct',
    apiToken: 'tok',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: {} }),
    }),
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-cf-noid-'));
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, FIXTURE_PNG);
  const result = await delivery.upload({ filePath: png, contentType: 'image/png' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'missing_result_id');
  assert.equal(isCloudflareImagesPublished(result), false);
});

test('Images failure after storage success → partial_success', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-partial-'));
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, FIXTURE_PNG);

  const delivery = new CloudflareImagesDeliveryAdapter({
    accountId: 'acct',
    apiToken: 'tok',
    fetchImpl: async () => ({
      ok: false,
      status: 403,
      json: async () => ({ success: false, errors: [{ message: 'API authorization failed' }] }),
    }),
  });

  const storage = new MemoryStorageAdapter();
  const plan = await planBrandAssetPromotion({
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
    source: png,
  }, { deliveryAdapter: delivery });

  const receiptDir = path.join(dir, '.agentsam', 'brand', 'assets', 'acme', 'app-icon', 'v1');
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(path.join(receiptDir, 'promotion.json'), `${JSON.stringify(plan)}\n`);

  const published = await publishBrandAssets({
    cwd: dir,
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
    dryRun: false,
    storageAdapter: storage,
    deliveryAdapter: delivery,
  });

  assert.equal(published.storage.status, 'published');
  assert.equal(published.delivery.status, 'failed');
  assert.equal(published.overall, 'partial_success');
  assert.equal(published.ok, true);
  assert.equal(isCloudflareImagesPublished(published.delivery), false);
  assert.equal(published.manifest.delivery.provider_asset_id, null);
});

test('manifest never treats r2_source_key as Cloudflare Images evidence', () => {
  const manifest = createBrandAssetManifest({
    spec: { brand: 'acme', asset: 'icon', version: 'v1', destinations: { storage: { provider: 'cloudflare-r2' } } },
    keys: resolveKeyLayout({ brand: 'acme', asset: 'icon', version: 'v1' }),
    objects: [{ role: 'source', key: 'brands/acme/icon/v1/source/icon-master.png', content_type: 'image/png', sha256: 'sha256:abc' }],
    derivatives: [],
    storage: { provider: 'cloudflare-r2', bucket: 'agentsam-os-blueprint-content', key: 'brands/acme/icon/v1/source/icon-master.png' },
    delivery: null,
  });
  assert.equal(manifest.delivery, null);
  assert.ok(!manifest.cloudflare_images);
  assert.equal(manifest.storage.provider, 'cloudflare-r2');
});

test('formatPublishReceipt keeps storage / delivery / registry separate', () => {
  const text = formatPublishReceipt({
    overall: 'success',
    storage: {
      provider: 'cloudflare-r2',
      status: 'published',
      binding: 'WEBSITE_ASSETS',
      objects: [{ key: 'brands/acme/app-icon/v1/source/app-icon-master.png' }],
    },
    delivery: {
      provider: 'cloudflare-images',
      status: 'published',
      provider_receipt: {
        provider_asset_id: '01abc',
        variants: ['https://imagedelivery.net/h/01abc/public'],
      },
    },
    registry: { status: 'published' },
  });
  assert.match(text, /Storage/);
  assert.match(text, /Delivery/);
  assert.match(text, /Registry/);
  assert.match(text, /Cloudflare R2/);
  assert.match(text, /Cloudflare Images/);
  assert.match(text, /image id {2}01abc/);
  assert.match(text, /✓ D1/);
});

test('inspectLocalAsset rejects pbm intermediates', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-pbm-'));
  const pbm = path.join(dir, 'foo-trace.pbm');
  fs.writeFileSync(pbm, 'P1\n1 1\n0\n');
  assert.throws(() => inspectLocalAsset(pbm), /excluded_intermediate|Excluded intermediate/);
});
