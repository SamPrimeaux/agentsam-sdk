import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  validateIconographyFamilyManifest,
  buildIconographyFamilyPack,
  inspectIconographyFamilyPack,
  packageIconographyFamilyPack,
} from '../src/core/iconography/family.js';

const svg = (fill = '#19A8E8') => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g id="symbol"><rect id="tile" x="1" y="1" width="22" height="22" rx="4" fill="${fill}"/><circle id="detail" cx="16" cy="8" r="3" fill="#FFD84D"/></g></svg>`;

async function fixture(t, { unsafe = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agentsam-icon-family-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const variants = {};
  for (const [name, color] of Object.entries({
    master: '#087FE8',
    micro: '#0BBBE8',
    monochrome_light: '#17263B',
    monochrome_dark: '#F5F8FF',
  })) {
    const file = `${name}.svg`;
    const body = unsafe && name === 'micro'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><script>alert(1)</script><path id="bad" d="M1 1"/></svg>`
      : svg(color);
    await fs.writeFile(path.join(root, file), body);
    variants[name] = file;
  }
  const manifest = {
    schema: 'agentsam.brand-icon-family.v1',
    family_id: 'test-icon-family',
    name: 'Test Icon Family',
    revision: 'r01',
    metadata: { brand_slug: 'test-brand', purpose: 'metadata round-trip test' },
    source_policy: {
      original_only: true,
      allow_external_icon_libraries: false,
      allow_third_party_marks: false,
    },
    size_sets: {
      menu: [16, 18, 24],
      standard: [48],
      app: [128, 180, 192, 512],
      favicon: [16, 24, 32, 48, 64, 128, 256],
      webp: [48, 128, 512],
    },
    icons: [{
      id: 'test-icon',
      name: 'Test Icon',
      semantic: 'test.icon',
      metadata: { colorway: 'test-blue', shape: 'squircle' },
      variants,
      layers: [{ id: 'symbol', name: 'Symbol' }],
    }],
  };
  const manifestPath = path.join(root, 'manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { root, manifestPath };
}

test('validates original editable SVG family sources and size ladder', async (t) => {
  const { manifestPath } = await fixture(t);
  const result = await validateIconographyFamilyManifest({ manifestPath });
  assert.equal(result.ok, true);
  assert.equal(result.icon_count, 1);
  assert.deepEqual(result.size_sets.menu, [16, 18, 24]);
  assert.equal(result.source_files.length, 4);
});

test('rejects unsafe SVG content before building', async (t) => {
  const { manifestPath } = await fixture(t, { unsafe: true });
  await assert.rejects(
    validateIconographyFamilyManifest({ manifestPath }),
    /iconography_svg_unsafe/,
  );
});

test('builds, verifies, and packages editable icon family with favicon frames', async (t) => {
  const { root, manifestPath } = await fixture(t);
  const output = path.join(path.dirname(root), `${path.basename(root)}-build`);
  const archive = `${output}.zip`;
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  t.after(() => fs.rm(archive, { force: true }));

  const built = await buildIconographyFamilyPack({ manifestPath, outDir: output });
  assert.equal(built.ok, true);
  assert.equal(built.icon_count, 1);
  assert.equal(built.file_count > 20, true);

  const micro = await fs.readFile(path.join(output, 'exports/test-icon/menu/color/16.png'));
  assert.equal(micro.readUInt32BE(16), 16);
  assert.equal(micro.readUInt32BE(20), 16);

  const ico = await fs.readFile(path.join(output, 'exports/test-icon/favicon/favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    const png = await fs.readFile(path.join(output, `exports/test-icon/favicon/${size}.png`));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }

  const builtManifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
  assert.equal(builtManifest.metadata.brand_slug, 'test-brand');
  assert.equal(builtManifest.icons[0].metadata.colorway, 'test-blue');
  assert.equal(builtManifest.icons[0].metadata.shape, 'squircle');

  const inspected = await inspectIconographyFamilyPack({ buildDir: output });
  assert.equal(inspected.ok, true);
  assert.deepEqual(inspected.failures, []);
  assert.deepEqual(inspected.ico_failures, []);

  const packaged = await packageIconographyFamilyPack({ buildDir: output, outFile: archive });
  assert.equal(packaged.ok, true);
  const zip = await fs.readFile(archive);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
