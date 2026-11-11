import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../');
const pkg = JSON.parse(readFileSync(resolve(root, 'packages/identity/package.json'), 'utf8'));
const feature = JSON.parse(readFileSync(resolve(root, 'packages/identity/.agentsam/features/oauth-login-portal/agentsam.feature.json'), 'utf8'));
const sql = readFileSync(resolve(root, 'migrations/d1/0026_identity_github_signin_product.sql'), 'utf8');

test('stock identity products point to the actual packaged source rather than obsolete SDK aliases', () => {
  assert.equal(pkg.name, '@inneranimalmedia/agentsam-identity');
  assert.equal(feature.package.name, pkg.name);
  assert.equal(feature.package.version, pkg.version);
  assert.ok(feature.artifacts.some(artifact => artifact.kind === 'provider-catalog'));
  assert.match(sql, /identity-signin-github/);
  assert.match(sql, /@inneranimalmedia\/agentsam-identity/);
  assert.match(sql, /catalog_visibility = 'internal'/);
  assert.match(sql, /ON CONFLICT\(slug\) DO NOTHING/);
  assert.doesNotMatch(sql, /catalog_visibility\s*=\s*'public'/);
});
