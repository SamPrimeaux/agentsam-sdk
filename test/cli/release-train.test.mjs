import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('release train check enforces public package versions and exact public internal pins', () => {
  const output = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /PASS all public release packages and dependency pins aligned/);
});

test('private source workspaces keep independent versions and local dependency links', () => {
  const viewer = JSON.parse(readFileSync(path.join(root, 'packages/agentsam-3d-viewer/package.json'), 'utf8'));
  const occt = JSON.parse(readFileSync(path.join(root, 'packages/agentsam-occt/package.json'), 'utf8'));
  const samsketch = JSON.parse(readFileSync(path.join(root, 'apps/samsketch/package.json'), 'utf8'));
  assert.equal(viewer.private, true);
  assert.equal(occt.private, true);
  assert.equal(samsketch.private, true);
  assert.equal(samsketch.dependencies['@inneranimalmedia/agentsam-occt'], 'file:../../packages/agentsam-occt');
  assert.equal(samsketch.dependencies['@inneranimalmedia/agentsam-3d-viewer'], 'file:../../packages/agentsam-3d-viewer');
});


test('independent ecommerce product publication follows the coordinated SDK release version', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'apps/ecommerce-cms-agentsam/package.json'), 'utf8'));
  const sdkManifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.version, sdkManifest.version);
  assert.notEqual(manifest.name, sdkManifest.name);
  assert.equal(manifest.publishConfig?.access, 'public');
  const check = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], {
    cwd: root, encoding: 'utf8',
  });
  assert.match(check, /PASS all public release packages and dependency pins aligned/);
});
