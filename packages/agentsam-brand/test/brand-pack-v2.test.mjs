import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createEmptyBrandPack,
  normalizeBrandPack,
  BRAND_PACK_SCHEMA,
  classifyAssetRole,
  listAssetRoles,
  planSemanticDerivatives,
  materializedToSharpDerivatives,
  RESPONSIVE_WIDTH_LADDER,
  extractFromCode,
  ingestBrandSources,
  buildBrandPackFromGraph,
  createPackFromTemplate,
  listBrandTemplates,
  FORMAT_FAMILIES,
  FORMAT_CAPABILITIES,
  getDerivativePreset,
} from '../src/index.js';

const FIXTURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('brand.pack.json empty graph has v2 schema', () => {
  const pack = createEmptyBrandPack({ brandId: 'acme', brandName: 'Acme' });
  assert.equal(pack.schema, BRAND_PACK_SCHEMA);
  assert.equal(pack.brand.id, 'acme');
  assert.ok(pack.assets);
  assert.ok(pack.tokens.color);
  assert.ok(pack.delivery.images);
  assert.equal(pack.delivery.policy, 'role_canonical');
});

test('v1 manifest migrates into v2 graph', () => {
  const pack = normalizeBrandPack({
    schema: 'agentsam.brand-pack.v1',
    brand: 'acme',
    asset: 'app-icon',
    version: 'v1',
  });
  assert.equal(pack.schema, BRAND_PACK_SCHEMA);
  assert.equal(pack.assets.length, 1);
  assert.equal(pack.assets[0].role, 'icon.app');
});

test('classifyAssetRole distinguishes logo vs icon vs font vs model', () => {
  assert.equal(classifyAssetRole({ path: 'primary-logo.svg' }).role, 'logo.primary');
  assert.equal(classifyAssetRole({ path: 'app-icon-1024.png' }).role, 'icon.app');
  assert.equal(classifyAssetRole({ path: 'InterVariable.ttf' }).role, 'type.body');
  assert.equal(classifyAssetRole({ path: 'product.glb' }).role, 'model.product');
  assert.equal(classifyAssetRole({ path: 'hero-final.png' }).role, 'hero.landscape');
  assert.ok(listAssetRoles().length > 20);
});

test('semantic derivatives: logo has delivery buckets not giant ladder', () => {
  const plan = planSemanticDerivatives('logo.primary');
  assert.equal(plan.family, 'logo');
  assert.ok(plan.buckets.delivery.length >= 3);
  assert.ok(plan.buckets.raster_fallbacks.every((d) => [256, 512, 1024].includes(d.width) || d.state));
  const sharp = materializedToSharpDerivatives(plan);
  assert.ok(sharp.length <= 3);
  assert.ok(RESPONSIVE_WIDTH_LADDER.includes(1920));
});

test('favicon plan includes maskable as separate composition', () => {
  const plan = planSemanticDerivatives('favicon');
  const maskable = plan.buckets.platform.filter((p) => p.semantic === 'maskable');
  assert.ok(maskable.length >= 2);
  assert.ok(maskable.every((m) => m.safe_padding === 0.2));
});

test('extractFromCode pulls colors, fonts, css vars from HTML', () => {
  const html = `
    <html><style>
      :root { --color-brand-primary: #ff5500; --color-text: oklch(0.2 0.02 250); }
      body { font-family: "Söhne", sans-serif; color: #111111; }
      .hero { background: url("./hero.png"); }
    </style>
    <img src="logo.svg" />
    </html>`;
  const out = extractFromCode(html, { filePath: 'index.html' });
  assert.ok(out.colors.some((c) => c.includes('ff5500') || c.includes('#ff5500')));
  assert.ok(out.fonts.includes('Söhne'));
  assert.ok(out.css_variables['--color-brand-primary']);
  assert.ok(out.asset_urls.some((u) => u.includes('logo.svg') || u.includes('hero.png')));
});

test('FORMAT_FAMILIES cover logo/video/model/font', () => {
  assert.ok(FORMAT_FAMILIES.logo.canonical.includes('svg'));
  assert.ok(FORMAT_FAMILIES.video.ingest.includes('mov'));
  assert.ok(FORMAT_FAMILIES.model.export.includes('usdz'));
  assert.equal(FORMAT_CAPABILITIES.otf.licensing_required, true);
  assert.equal(FORMAT_CAPABILITIES.zip.container, true);
});

test('templates seed required roles without inventing binaries', () => {
  const pack = createPackFromTemplate('product-saas', { brandId: 'acme', brandName: 'Acme' });
  assert.ok(pack.assets.some((a) => a.role === 'logo.primary'));
  assert.ok(pack.assets.some((a) => a.role === 'favicon'));
  assert.ok(pack.validation.warnings.some((w) => w.code === 'template_role_unfilled'));
  assert.ok(listBrandTemplates().find((t) => t.id === 'web-app'));
});

test('ingest folder + build compiles brand.pack.json as SoT', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-v2-'));
  fs.writeFileSync(path.join(dir, 'primary-logo.png'), FIXTURE_PNG);
  fs.writeFileSync(path.join(dir, 'favicon-32.png'), FIXTURE_PNG);
  fs.writeFileSync(
    path.join(dir, 'theme.css'),
    ':root { --color-brand-primary: #0a84ff; } body { font-family: Inter, sans-serif; }',
  );

  const ingested = await ingestBrandSources(dir, {
    brandId: 'demo',
    cwd: dir,
    outDir: path.join(dir, 'pack'),
  });
  assert.equal(ingested.ok, true);
  assert.ok(ingested.stats.assets >= 2);
  assert.ok(fs.existsSync(ingested.pack_path));
  assert.equal(ingested.pack.schema, BRAND_PACK_SCHEMA);
  assert.ok(Object.keys(ingested.pack.tokens.color).length >= 1);

  const built = await buildBrandPackFromGraph({
    pack: ingested.pack,
    cwd: dir,
    outDir: path.join(dir, 'dist'),
    zip: true,
    zipPath: path.join(dir, 'demo.zip'),
  });
  assert.equal(built.ok, true);
  assert.ok(fs.existsSync(built.source_of_truth));
  assert.ok(fs.existsSync(built.studio));
  assert.ok(fs.existsSync(path.join(built.dist, 'brand-tokens', 'tokens.css')));
  assert.ok(built.zip && fs.existsSync(built.zip));
  // ZIP is export — SoT is brand.pack.json
  assert.match(built.source_of_truth, /brand\.pack\.json$/);
});

test('presets favicon is platform compiler sized', () => {
  const fav = getDerivativePreset('favicon');
  assert.ok(fav.derivatives.length >= 6);
  assert.equal(fav.role, 'favicon');
  assert.equal(fav.semantic, true);
  assert.equal(getDerivativePreset('logo').role, 'logo.primary');
});
