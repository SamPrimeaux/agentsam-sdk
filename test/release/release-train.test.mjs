import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { findPrivateWorkspaceDependencyEdges, registryVersionMatches, unwrapSingleNpmViewValue } from '../../scripts/release-train-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('release train check enforces public package versions and exact public internal pins', () => {
  const output = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /PASS all public release packages and dependency pins aligned/);
});

test('release train check ignores stale installed copies under nested node_modules', () => {
  const nm = path.join(root, 'apps/local-studio/backend/node_modules');
  assert.equal(existsSync(nm), false, 'test needs a tree without a local-studio backend install');
  const pkgDir = path.join(nm, '@inneranimalmedia/agentsam-sdk');
  try {
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@inneranimalmedia/agentsam-sdk', version: '0.0.1' }));
    const output = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], { cwd: root, encoding: 'utf8' });
    assert.match(output, /PASS all public release packages and dependency pins aligned/);
  } finally {
    rmSync(nm, { recursive: true, force: true });
  }
});

test('OCCT and viewer are public npm packages consumed through registry pins', () => {
  const viewer = JSON.parse(readFileSync(path.join(root, 'packages/agentsam-3d-viewer/package.json'), 'utf8'));
  const occt = JSON.parse(readFileSync(path.join(root, 'packages/agentsam-occt/package.json'), 'utf8'));
  const samsketch = JSON.parse(readFileSync(path.join(root, 'apps/samsketch/package.json'), 'utf8'));
  const cadFrontend = JSON.parse(readFileSync(path.join(root, 'apps/cad-creator/frontend/package.json'), 'utf8'));
  assert.notEqual(viewer.private, true);
  assert.equal(viewer.publishConfig?.access, 'public');
  assert.equal(viewer.license, 'FSL-1.1-MIT');
  assert.notEqual(occt.private, true);
  assert.equal(occt.publishConfig?.access, 'public');
  assert.equal(occt.license, 'FSL-1.1-MIT');
  assert.equal(samsketch.private, true);
  // Exact version pins (never file:), kept equal to the packages the app links by the release train.
  assert.equal(samsketch.dependencies['@inneranimalmedia/agentsam-occt'], occt.version);
  assert.equal(samsketch.dependencies['@inneranimalmedia/agentsam-3d-viewer'], viewer.version);
  assert.match(cadFrontend.dependencies['@inneranimalmedia/agentsam-3d-viewer'], /^\d+\.\d+\.\d+$/);
});

test('registry version verification accepts npm JSON scalar and array responses', () => {
  assert.equal(registryVersionMatches('2.6.15', '2.6.15'), true);
  assert.equal(registryVersionMatches(['2.6.15'], '2.6.15'), true);
  assert.equal(registryVersionMatches(['2.6.14'], '2.6.15'), false);
  assert.deepEqual(unwrapSingleNpmViewValue([{ '.': { import: './src/index.js' } }]), { '.': { import: './src/index.js' } });
});

test('release policy rejects a public package that depends on a private workspace', () => {
  const edges = findPrivateWorkspaceDependencyEdges([
    { file: 'packages/public/package.json', manifest: { name: '@inneranimalmedia/public', dependencies: { '@inneranimalmedia/private': '2.6.15' } } },
    { file: 'packages/private/package.json', manifest: { name: '@inneranimalmedia/private', private: true } },
  ]);
  assert.deepEqual(edges, [{
    consumer: '@inneranimalmedia/public',
    dependency: '@inneranimalmedia/private',
    section: 'dependencies',
    file: 'packages/public/package.json',
  }]);
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


test('Completeful can release independently without bumping every SDK package', () => {
  const provider = JSON.parse(readFileSync(path.join(root, 'packages/providers/completeful/package.json'), 'utf8'));
  const sdk = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(provider.releaseTrain, 'independent');
  assert.match(provider.version, /^\d+\.\d+\.\d+$/);
  assert.match(sdk.version, /^\d+\.\d+\.\d+$/);
  const check = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], {
    cwd: root, encoding: 'utf8',
  });
  assert.match(check, /PASS all public release packages and dependency pins aligned/);
  const nextVersion = sdk.version.replace(/(\d+)$/, (_, patch) => String(Number(patch) + 1));
  const alignPreview = execFileSync(process.execPath, [
    'scripts/release-train.mjs', 'align', nextVersion, '--dry-run',
  ], { cwd: root, encoding: 'utf8' });
  assert.match(alignPreview, /WOULD ALIGN @inneranimalmedia\/agentsam-sdk@/);
  assert.doesNotMatch(alignPreview, /WOULD ALIGN @inneranimalmedia\/agentsam-provider-completeful@/);
  assert.doesNotMatch(alignPreview, /WOULD ALIGN @inneranimalmedia\/samsketch@/);
});
