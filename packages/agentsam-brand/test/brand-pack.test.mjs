import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  sniffImageBuffer,
  buildBrandPack,
  buildGalleryHtml,
  writeZipArchive,
  listDerivativePresets,
  getDerivativePreset,
  FORMAT_CAPABILITIES,
  formatCapabilities,
  canResizeFormat,
  CloudflareImagesDeliveryAdapter,
  CANONICAL_PNG_DELIVERY_POLICY_TYPES,
  AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES,
} from '../src/index.js';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('FORMAT_CAPABILITIES: raster ladders vs svg', () => {
  assert.equal(canResizeFormat('png'), true);
  assert.equal(canResizeFormat('webp'), true);
  assert.equal(canResizeFormat('svg'), false);
  assert.equal(formatCapabilities('svg').recolorable, true);
  assert.equal(FORMAT_CAPABILITIES.mp4.poster_frame, true);
});

test('presets include favicon, og-image, logo', () => {
  const ids = listDerivativePresets().map((p) => p.id);
  assert.ok(ids.includes('favicon'));
  assert.ok(ids.includes('og-image'));
  assert.ok(ids.includes('logo'));
  assert.ok(ids.includes('app-icon'));
  assert.equal(getDerivativePreset('favicon').derivatives.length, 8);
  assert.equal(getDerivativePreset('og-image').derivatives[0].width, 1200);
  assert.ok(getDerivativePreset('logo').derivatives.length >= 3);
});

test('stdin sniff: png / jpeg / webp / svg', () => {
  assert.equal(sniffImageBuffer(FIXTURE_PNG).ext, '.png');
  assert.equal(sniffImageBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).ext, '.jpg');
  const webp = Buffer.alloc(16);
  webp.write('RIFF', 0);
  webp.writeUInt32LE(8, 4);
  webp.write('WEBP', 8);
  assert.equal(sniffImageBuffer(webp).ext, '.webp');
  assert.equal(sniffImageBuffer(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')).ext, '.svg');
  assert.equal(sniffImageBuffer(Buffer.from('not-an-image')), null);
});

test('canonical_png policy rename + agentsam alias', () => {
  assert.deepEqual([...CANONICAL_PNG_DELIVERY_POLICY_TYPES], ['image/png']);
  assert.equal(AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES, CANONICAL_PNG_DELIVERY_POLICY_TYPES);
  const adapter = new CloudflareImagesDeliveryAdapter({
    accountId: 'a',
    apiToken: 't',
  });
  assert.equal(adapter.policy, 'canonical_png');
});

test('CF Images 5409 already exists is skip/exists not fatal', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-5409-'));
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, FIXTURE_PNG);

  const delivery = new CloudflareImagesDeliveryAdapter({
    accountId: 'acct',
    accountHash: 'hash',
    apiToken: 'tok',
    fetchImpl: async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        success: false,
        errors: [{ code: 5409, message: 'Resource already exists' }],
      }),
    }),
  });

  const result = await delivery.upload({
    filePath: png,
    fileName: 'icon.png',
    contentType: 'image/png',
    metadata: { id: 'existing-id' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'exists');
  assert.equal(result.error_code, 5409);
});

test('writeZipArchive round-trips entries', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-zip-'));
  const zipPath = path.join(dir, 'out.zip');
  writeZipArchive(
    [
      { name: 'demo/app-icon/v1/manifest.json', data: '{"ok":true}' },
      { name: 'demo/app-icon/v1/source/x.png', data: FIXTURE_PNG },
    ],
    zipPath,
  );
  assert.ok(fs.existsSync(zipPath));
  assert.ok(fs.statSync(zipPath).size > 40);
});

test('buildBrandPack layout + gallery + seo', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-pack-'));
  const png = path.join(dir, 'master.png');
  fs.writeFileSync(png, FIXTURE_PNG);
  const outDir = path.join(dir, 'pack');
  const zipPath = path.join(dir, 'demo-pack.zip');

  const result = await buildBrandPack({
    brand: 'demo',
    asset: 'app-icon',
    version: 'v1',
    sourcePath: png,
    preset: 'favicon',
    outDir,
    zipPath,
    altText: 'Demo icon',
    title: 'Demo',
    description: 'Test pack',
  });

  assert.equal(result.ok, true);
  assert.ok(fs.existsSync(path.join(outDir, 'manifest.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'gallery.html')));
  assert.ok(fs.existsSync(path.join(outDir, 'source')));
  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
  assert.equal(manifest.brand, 'demo');
  assert.equal(manifest.seo.alt_text, 'Demo icon');
  assert.ok(manifest.format_capabilities.png);
  assert.ok(result.zip);
  assert.match(buildGalleryHtml({ brand: 'a', asset: 'b', version: 'v1', items: [] }), /brand pack/);
});
