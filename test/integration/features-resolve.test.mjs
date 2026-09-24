/**
 * Feature-packet resolver tests — package-local oauth-login-portal compartment.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatResourcesSummary,
  getIdentityProviderTemplate,
  loadIdentityResources,
  loadOAuthLoginPortalFeature,
  resolveAuthFeature,
  writeFeatureSelections,
  writeFeaturesResolved,
} from '../../src/features/resolve.js';

const SDK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('oauth-login-portal feature packet loads with artifacts', () => {
  const feature = loadOAuthLoginPortalFeature();
  assert.equal(feature.id, 'identity.oauth-login-portal');
  assert.ok(Array.isArray(feature.artifacts));
  assert.ok(feature.artifacts.some((a) => a.kind === 'provider-catalog'));
  assert.ok(!fs.existsSync(path.join(SDK_ROOT, 'protocol/identity')));
  assert.ok(!fs.existsSync(path.join(SDK_ROOT, 'protocol/features/auth.json')));
});

test('auth feature resolves real D1 resources, not a pretend iam-d1 profile', () => {
  const resolved = resolveAuthFeature({
    selected: true,
    capabilities: ['identity.init'],
    provider_template: 'google',
    selected_at: '2026-09-24T04:25:12.860Z',
  });
  assert.equal(resolved.provider_template, 'google');
  assert.equal(resolved.provider.id, 'google');
  assert.equal(resolved.provider.status, 'ready');
  assert.equal(resolved.schema_profile, undefined);
  assert.equal(resolved.resources.engine, 'd1');
  assert.deepEqual(resolved.resources.migration_sources, [
    'src/migrations/0001_identity_core.sql',
    'src/migrations/0002_company.sql',
  ]);
  const names = resolved.resources.tables.map((t) => t.name);
  assert.deepEqual(names, [
    'auth_users',
    'auth_sessions',
    'account_identities',
    'oauth_states',
    'password_reset_tokens',
    'company',
  ]);
  assert.match(formatResourcesSummary(resolved.resources), /tables=auth_users,/);
  assert.doesNotMatch(formatResourcesSummary(resolved.resources), /iam-d1/);
});

test('legacy iam provider_template normalizes to inneranimalmedia', () => {
  const resolved = resolveAuthFeature({
    selected: true,
    capabilities: ['identity.init'],
    provider_template: 'iam',
  });
  assert.equal(resolved.provider_template, 'inneranimalmedia');
  assert.equal(resolved.provider.id, 'inneranimalmedia');
  assert.equal(resolved.provider.oauth_provider_key, 'iam');
  assert.equal(resolved.provider.status, 'ready');
});

test('cloudflare is registered ready in provider catalog', () => {
  const provider = getIdentityProviderTemplate('cloudflare');
  assert.equal(provider?.status, 'ready');
  assert.equal(provider?.registered, true);
});

test('resources.json indexes D1 tables without owning DDL', () => {
  const resources = loadIdentityResources();
  assert.equal(resources.engine, 'd1');
  assert.deepEqual(resources.migration_sources, [
    'src/migrations/0001_identity_core.sql',
    'src/migrations/0002_company.sql',
  ]);
  const names = resources.tables.map((t) => t.name);
  assert.ok(names.includes('auth_users'));
  assert.ok(names.includes('company'));
});

test('writeFeatureSelections emits schema_version 2 and resolved snapshot', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-features-'));
  try {
    fs.mkdirSync(path.join(cwd, '.agentsam'), { recursive: true });
    const { state_path, resolved_path, snapshot } = writeFeatureSelections(cwd, {
      schema_version: 2,
      features: {
        auth: {
          selected: true,
          capabilities: ['identity.init'],
          provider_template: 'inneranimalmedia',
          selected_at: '2026-09-24T04:25:12.860Z',
        },
      },
    });
    const state = JSON.parse(fs.readFileSync(state_path, 'utf8'));
    assert.equal(state.schema_version, 2);
    assert.equal(state.features.auth.provider_template, 'inneranimalmedia');
    assert.equal(snapshot.features.auth.resources.engine, 'd1');
    assert.ok(snapshot.features.auth.resources.tables.some((t) => t.name === 'auth_users'));
    assert.equal(snapshot.features.auth.schema_profile, undefined);
    assert.ok(fs.existsSync(resolved_path));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('sdk project selections resolve against package packet', () => {
  const { snapshot } = writeFeaturesResolved(SDK_ROOT);
  assert.equal(snapshot.schema, 'agentsam.features.resolved.v1');
  assert.equal(snapshot.features.auth.provider_template, 'inneranimalmedia');
  assert.equal(snapshot.features.auth.feature.id, 'identity.oauth-login-portal');
  assert.equal(snapshot.features.auth.resources.engine, 'd1');
  assert.match(
    formatResourcesSummary(snapshot.features.auth.resources),
    /auth_users,auth_sessions,account_identities/,
  );
});
