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

test('CMS app scaffold source is included in the SDK distribution contract', async () => {
  const { validateApps } = await import('../../src/commands/app.js');
  const report = validateApps({ appId: 'client-cms-editor' });
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.deepEqual(report.warnings, []);
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


test('Ecommerce CMS app bin exposes truthful doctor state', () => {
  const bin = path.resolve('apps/ecommerce-cms-agentsam/bin/ecommerce.mjs');
  const result = spawnSync(process.execPath, [bin, 'doctor'], { cwd: path.resolve('.'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.app, 'ecommerce-cms-agentsam');
  assert.deepEqual(report.missing, []);
  assert.equal(report.source_ready, true);
  assert.equal(report.package_boundary_ready, true);
  assert.deepEqual(report.package_boundary_issues, []);
  // Truthful by design: these are only true after a real clean install / owner provisioning.
  assert.equal(typeof report.standalone_install_verified, 'boolean');
  assert.equal(typeof report.deployment_ready, 'boolean');
});

test('Ecommerce CMS app manifest, package and bin agree', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve('apps/ecommerce-cms-agentsam/agentsam.app.json'), 'utf8'),
  );
  const pkg = JSON.parse(fs.readFileSync(path.resolve('apps/ecommerce-cms-agentsam/package.json'), 'utf8'));
  assert.equal(manifest.kind, 'app');
  assert.equal(manifest.package, pkg.name);
  assert.equal(pkg.bin.ecommerce, manifest.bin);
  assert.equal(fs.existsSync(path.resolve('apps/ecommerce-cms-agentsam', manifest.bin)), true);
  assert.equal(manifest.commands.preview, 'ecommerce preview');
  assert.equal(typeof pkg.scripts.preview, 'string');
  const host = JSON.parse(fs.readFileSync(path.resolve('apps/ecommerce-cms-agentsam/.agentsam/app.json'), 'utf8'));
  assert.equal(host.schema, 'agentsam.host-install.v1');
  assert.equal(host.app_id, manifest.id);
});

test('included_apps are buildable by the generic host builder (no hardcoded per-app logic)', async () => {
  const { listAppManifests } = await import('../../src/commands/app.js');
  const desktop = JSON.parse(
    fs.readFileSync(path.resolve('packages/agentsam-desktop-shell/manifests/local-studio.json'), 'utf8'),
  );
  const byId = new Map(listAppManifests().map((row) => [row.id, row]));
  for (const id of desktop.included_apps) {
    assert.ok(byId.get(id)?.manifest.embed?.build, `${id} must declare embed.build in its agentsam.app.json`);
  }
});

test('validateEmbed rejects malformed embed blocks', async () => {
  const { validateEmbed } = await import('../../src/commands/app.js');
  assert.deepEqual(validateEmbed({}, 'x'), []);
  assert.deepEqual(validateEmbed({ embed: { stage: 'ok', build: { command: ['npm', 'run', 'build'], output: 'dist' } } }, 'x'), []);
  const bad = validateEmbed({ embed: { stage: 'Bad Stage', build: { command: [], output: '../out', install: {} } } }, 'x');
  assert.equal(bad.length, 4, bad.join('\n'));
});
