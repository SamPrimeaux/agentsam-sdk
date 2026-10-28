import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(packageRoot, 'assets/iconography/v1');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

 test('iconography manifest keeps the canonical app-icon sources and presentation boundary', async () => {
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'iconography.manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'agentsam.brand-iconography.v1');
  assert.deepEqual(manifest.app_icons.map((row) => row.id), ['inneranimalmedia', 'agentsam-desktop']);
  const desktop = manifest.app_icons.find((row) => row.id === 'agentsam-desktop');
  assert.equal(desktop.source, 'sources/agentsam-desktop-icon-1024-master.png');
  assert.equal(desktop.source_repository_path, 'packages/agentsam-desktop-shell/src-tauri/icons/icon-1024-master.png');
  const copiedDesktopMaster = await readFile(path.join(sourceRoot, desktop.source));
  const canonicalDesktopMaster = await readFile(path.resolve(packageRoot, '../agentsam-desktop-shell/src-tauri/icons/icon-1024-master.png'));
  assert.equal(sha256(copiedDesktopMaster), sha256(canonicalDesktopMaster), 'AgentSam desktop source must match the canonical Tauri master');
  assert.equal(manifest.delivery.source_masters_immutable, true);
  assert.equal(manifest.delivery.output_is_derivative_only, true);
  assert.match(manifest.clay_renderer.purpose, /not (?:a generic GLB optimizer|GLB optimization)/);
  for (const app of manifest.app_icons) {
    const source = await readFile(path.join(sourceRoot, app.source));
    assert.ok(source.byteLength > 1000);
  }
});

test('system icon catalog has 64 unique semantic SVG masters with normalized stroke geometry', async () => {
  const catalog = JSON.parse(await readFile(path.join(sourceRoot, 'sources/system-icons.json'), 'utf8'));
  assert.equal(catalog.icon_count, 64);
  assert.equal(catalog.icons.length, 64);
  assert.equal(new Set(catalog.icons.map((icon) => icon.id)).size, 64);
  assert.equal(new Set(catalog.icons.map((icon) => icon.source_sha256)).size, 64);
  for (const icon of catalog.icons) {
    assert.ok(icon.semantic.includes('.'));
    assert.equal(icon.view_box, '0 0 24 24');
    assert.equal(icon.stroke_width, 2);
    assert.equal(icon.visible_label_baked_in, false);
    const source = await readFile(path.join(sourceRoot, icon.source));
    assert.equal(sha256(source), icon.source_sha256, `source hash: ${icon.id}`);
    assert.match(source.toString(), /viewBox="0 0 24 24"/);
    assert.match(source.toString(), /stroke-width="2"/);
    assert.doesNotMatch(source.toString(), /<text\b|<script\b/i);
  }
});
