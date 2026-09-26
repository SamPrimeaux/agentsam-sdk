import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { listAppManifests } from '../../src/commands/app.js';

test('lists agentsam.app.json manifests for product apps', () => {
  const apps = listAppManifests();
  const ids = apps.map((row) => row.id).sort();
  assert.ok(ids.includes('cad-creator'));
  assert.ok(ids.includes('local-studio'));
  assert.ok(ids.includes('client-cms-editor'));
  assert.ok(ids.includes('ecommerce-cms-agentsam'));
});

test('agentsam app validate passes for all product apps', async () => {
  const { validateApps } = await import('../../src/commands/app.js');
  const report = validateApps();
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.ok(report.apps.length >= 4);
});

test('CAD and CMS workers load APP identity from agentsam.app.json', () => {
  const cad = fs.readFileSync(path.resolve('apps/cad-creator/backend/worker/index.js'), 'utf8');
  const cms = fs.readFileSync(path.resolve('apps/client-cms-editor/backend/worker/index.js'), 'utf8');
  assert.match(cad, /import appManifest from ['"]\.\.\/\.\.\/agentsam\.app\.json['"]/);
  assert.match(cms, /import appManifest from ['"]\.\.\/\.\.\/agentsam\.app\.json['"]/);
  assert.doesNotMatch(cad, /const\s+APP\s*=\s*["']/);
  assert.doesNotMatch(cms, /const\s+APP\s*=\s*["']/);
});

test('desktop CMS shell app_id resolves to client-cms-editor', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve('packages/agentsam-desktop-shell/manifests/cms-editor.json'), 'utf8'),
  );
  assert.equal(manifest.app_id, 'client-cms-editor');
});


test('Ecommerce CMS app bin exposes truthful runnable doctor state', () => {
  const bin = path.resolve('apps/ecommerce-cms-agentsam/bin/agentsam-ecommerce.mjs');
  const result = spawnSync(process.execPath, [bin, 'doctor', '--json'], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.app_id, 'ecommerce-cms-agentsam');
  assert.equal(report.source.frontend, true);
  assert.equal(report.runtime.package_json, true);
  assert.equal(report.runtime.runnable, true);
  assert.equal(report.manifest_runtime.local_preview, 'ready');
  assert.equal(report.manifest_runtime.source_scaffold, 'ready');
  assert.equal(report.contract_consistent, true);
});

test('Ecommerce CMS app manifest and package agree on executable preview', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve('apps/ecommerce-cms-agentsam/agentsam.app.json'), 'utf8'),
  );
  const pkg = JSON.parse(
    fs.readFileSync(path.resolve('apps/ecommerce-cms-agentsam/package.json'), 'utf8'),
  );
  const frontendPkg = JSON.parse(
    fs.readFileSync(path.resolve('apps/ecommerce-cms-agentsam/frontend/package.json'), 'utf8'),
  );

  assert.equal(manifest.package, pkg.name);
  assert.equal(manifest.bin, 'bin/agentsam-ecommerce.mjs');
  assert.equal(manifest.runtime.local_preview, 'ready');
  assert.equal(manifest.runtime.source_scaffold, 'ready');
  assert.equal(manifest.preview.entry, '/admin');
  assert.equal(manifest.preview.port, 4174);
  assert.equal(typeof pkg.scripts.preview, 'string');
  assert.equal(typeof frontendPkg.scripts.preview, 'string');
});
