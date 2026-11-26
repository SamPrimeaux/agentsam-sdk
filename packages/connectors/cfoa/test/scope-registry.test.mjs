import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProviderPermissionCatalog,
  loadProviderPermissionCatalog,
  resolvePermissionScopes,
  listProviderScopeOptions,
  filterToRegistry,
  activeGrantedScopes,
} from '../src/scope-registry.js';

const rawCatalog = {
  providerKey: 'cloudflare',
  pluginId: 'plugin-root',
  pluginKey: 'cloudflare-main',
  baselineScopes: ['offline_access', 'user-details.read'],
  defaultPacks: ['store'],
  aliases: { media: ['store', 'create'], data: ['store'], legacy: ['media'] },
  packs: [
    { id: 'store', label: 'Store', scopes: ['d1.read', 'd1.write'] },
    { id: 'create', label: 'Create', scopes: ['images.read', 'images.write'] },
  ],
  capabilities: [
    { id: 'cloudflare.r2', label: 'R2', scopes: ['workers-r2.read', 'workers-r2.write'] },
  ],
};

test('permission catalog normalizes host data without a database or host schema', async () => {
  const catalog = await loadProviderPermissionCatalog({
    async getOAuthPermissionCatalog(providerKey) {
      assert.equal(providerKey, 'cloudflare');
      return rawCatalog;
    },
  });
  assert.equal(catalog.pluginKey, 'cloudflare-main');
  assert.deepEqual(catalog.baselineScopes, ['offline_access', 'user-details.read']);
  assert.deepEqual(catalog.packs.map((pack) => pack.id), ['store', 'create']);
  assert.equal(catalog.availableScopes.has('images.write'), true);
  assert.equal(catalog.availableScopes.has('unregistered.write'), false);
});

test('registry rejects a provider catalog returned for the wrong provider', async () => {
  const catalog = await loadProviderPermissionCatalog({
    async getOAuthPermissionCatalog() { return { ...rawCatalog, providerKey: 'google' }; },
  });
  assert.equal(catalog, null);
});

test('connector can be reused with a callback-backed registry and no D1 binding', async () => {
  const catalog = await loadProviderPermissionCatalog(async () => rawCatalog);
  const selection = resolvePermissionScopes(catalog, { packs: ['media'] });
  assert.equal(selection.ok, true);
  assert.deepEqual(new Set(selection.scopes), new Set([
    'offline_access', 'user-details.read', 'd1.read', 'd1.write', 'images.read', 'images.write',
  ]));
  assert.deepEqual(selection.packs.sort(), ['create', 'store']);
});

test('legacy aliases expand from host data, including nested aliases', async () => {
  const catalog = normalizeProviderPermissionCatalog(rawCatalog);
  const selection = resolvePermissionScopes(catalog, { packs: ['legacy'] });
  assert.equal(selection.ok, true);
  assert.deepEqual(selection.packs.sort(), ['create', 'store']);
});

test('defaults come from the catalog only when no pack or capability is requested', async () => {
  const catalog = normalizeProviderPermissionCatalog(rawCatalog);
  const defaultSelection = resolvePermissionScopes(catalog);
  assert.equal(defaultSelection.ok, true);
  assert.deepEqual(defaultSelection.packs, ['store']);
  assert.ok(defaultSelection.scopes.includes('d1.write'));
  const capabilitySelection = resolvePermissionScopes(catalog, { capabilities: ['cloudflare.r2'] });
  assert.deepEqual(capabilitySelection.packs, []);
  assert.ok(capabilitySelection.scopes.includes('workers-r2.write'));
  assert.ok(!capabilitySelection.scopes.includes('d1.write'));
});

test('full permission catalog requires an explicit exclusive opt-in', () => {
  const catalog = normalizeProviderPermissionCatalog({
    ...rawCatalog,
    allow_full_catalog_opt_in: true,
    available_permissions: [{ scope: 'account.wide.read', label: 'Account Wide', category: 'account' }],
  });
  const all = resolvePermissionScopes(catalog, { packs: ['all'] });
  assert.equal(all.ok, true);
  assert.equal(all.packs[0], 'all');
  assert.ok(all.scopes.includes('account.wide.read'));
  assert.equal(all.scopes.length, catalog.availableScopes.size);
  assert.deepEqual(resolvePermissionScopes(catalog, { packs: ['all', 'store'] }), {
    ok: false,
    error: 'cloudflare_full_catalog_opt_in_must_be_exclusive',
  });
  assert.deepEqual(resolvePermissionScopes(normalizeProviderPermissionCatalog(rawCatalog), { packs: ['all'] }), {
    ok: false,
    error: 'cloudflare_permission_pack_unavailable',
    unknown_packs: ['all'],
  });
});

test('unknown packs and capabilities fail closed', async () => {
  const catalog = normalizeProviderPermissionCatalog(rawCatalog);
  assert.deepEqual(resolvePermissionScopes(catalog, { packs: ['invented'] }), {
    ok: false,
    error: 'cloudflare_permission_pack_unavailable',
    unknown_packs: ['invented'],
  });
  assert.deepEqual(resolvePermissionScopes(catalog, { capabilities: ['cloudflare.unknown'] }), {
    ok: false,
    error: 'cloudflare_capability_unavailable',
    unknown_capabilities: ['cloudflare.unknown'],
  });
});

test('packs cannot reference capabilities absent from the host catalog', () => {
  const catalog = normalizeProviderPermissionCatalog({
    providerKey: 'cloudflare',
    packs: [{ id: 'broken', scopes: ['resource.read'], capabilities: ['cloudflare.missing'] }],
    capabilities: [],
  });
  assert.deepEqual(resolvePermissionScopes(catalog, { packs: ['broken'] }), {
    ok: false,
    error: 'cloudflare_permission_pack_capability_unavailable',
    unknown_capabilities: ['cloudflare.missing'],
  });
});

test('available permissions are distinct from actual grants', () => {
  const catalog = normalizeProviderPermissionCatalog(rawCatalog);
  const available = listProviderScopeOptions(catalog);
  assert.ok(available.some((row) => row.scope === 'd1.write'));
  assert.ok(available.some((row) => row.scope === 'workers-r2.read'));
  assert.deepEqual(filterToRegistry(['d1.read', 'invented.write'], catalog), ['d1.read']);
});

test('active grants are read from the connector token store and remain account-scoped', async () => {
  let query = '';
  const env = {
    DB: {
      prepare(sql) {
        query = sql;
        return {
          bind(...args) {
            assert.deepEqual(args, ['user-1', 'cloudflare', 'account-1']);
            return { first: async () => ({ scopes: 'd1.read images.read' }) };
          },
        };
      },
    },
  };
  assert.deepEqual(await activeGrantedScopes(env, 'user-1', 'cloudflare', 'account-1'), ['d1.read', 'images.read']);
  assert.match(query, /user_oauth_tokens/);
  assert.doesNotMatch(query, /agentsam_plugins|agentsam_provider_scopes/);
});
