import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const projects = [
  '.',
  'apps/cad-creator',
  'apps/local-studio',
  'apps/ecommerce-cms-agentsam/frontend',
  'apps/samsketch',
  'apps/samspeaks',
  'packages/theme-plain-jane/source',
  'apps/cad-creator/reference/robotics-donor/4aa63fff4149',
];
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('SDK and nested projects resolve Picomatch from the public npm registry', () => {
  const rootManifest = readJson('package.json');
  assert.equal(rootManifest.devDependencies?.picomatch, '4.0.7');
  assert.equal(rootManifest.overrides?.picomatch, undefined);
  for (const project of projects) {
    const manifest = readJson(path.posix.join(project, 'package.json'));
    const lock = readJson(path.posix.join(project, 'package-lock.json'));
    assert.equal(manifest.overrides?.picomatch, undefined, project + ': no private override');
    const matches = Object.entries(lock.packages || {}).filter(([location]) =>
      location === 'node_modules/picomatch' || location.endsWith('/node_modules/picomatch'));
    assert.ok(matches.length > 0, project + ': Picomatch remains in the dependency graph');
    for (const [location, pkg] of matches) {
      assert.ok(pkg.version, project + ' ' + location + ': locked version exists');
      assert.ok((pkg.resolved || '').startsWith('https://registry.npmjs.org/picomatch/-/'),
        project + ' ' + location + ': public npm registry source');
    }
  }
});

test('the SDK uses official upstream Picomatch 4.0.7 with normal glob behavior', () => {
  const pkg = require('picomatch/package.json');
  const picomatch = require('picomatch');
  assert.equal(pkg.name, 'picomatch');
  assert.equal(pkg.version, '4.0.7');
  assert.equal(picomatch.isMatch('src/file.ts', '**/*.ts'), true);
  assert.equal(picomatch.isMatch('src/file.js', '**/*.ts'), false);
});

test('custom fork source and pinned-artifact attestation are absent', () => {
  assert.equal(fs.existsSync(path.join(root, 'vendor/security')), false);
  assert.equal(fs.existsSync(path.join(root, 'src/security/pinned-artifacts.js')), false);
});
