import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(appRoot, '../..');
const appManifest = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
const sdkManifest = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

test('Ecommerce consumes Identity and Vault through the canonical SDK package', () => {
  assert.equal(
    appManifest.dependencies['@inneranimalmedia/agentsam-sdk'],
    sdkManifest.version,
  );
  assert.equal(appManifest.dependencies['@inneranimalmedia/agentsam-identity'], undefined);
  assert.equal(appManifest.dependencies['@inneranimalmedia/agentsam-vault'], undefined);

  const requiredExports = [
    './identity/adapters/portable-d1',
    './identity/contracts/routes',
    './identity/server/worker-router',
    './identity/core/password-crypto',
    './identity/core/password-gate',
    './identity/frontend/auth-portal/store-access',
    './identity/frontend/auth-portal/*',
    './identity/migrations/sqlite/*',
    './vault/resolver',
    './vault/crypto',
  ];
  for (const key of requiredExports) {
    const target = sdkManifest.exports[key];
    assert.equal(typeof target, 'string', 'SDK export missing: ' + key);
    const relativeTarget = target.replace(/^\.\//, '');
    assert.ok(
      readFileSync(path.join(repositoryRoot, relativeTarget)) || relativeTarget,
      'SDK export target missing: ' + key,
    );
  }
});

test('Ecommerce runtime and build scripts do not bypass the SDK Identity/Vault boundary', () => {
  const files = [
    'backend/storefront/identity.js',
    'backend/storefront/access.js',
    'backend/admin/store.js',
    'tests/storefront-access-gate.test.mjs',
    'scripts/sync-identity-portals.mjs',
    'scripts/sync-identity-migration.mjs',
  ];
  const source = files
    .map((file) => readFileSync(path.join(appRoot, file), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /@inneranimalmedia\/agentsam-(?:identity|vault)\//);
});
