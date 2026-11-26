import test from 'node:test';
import assert from 'node:assert/strict';
import { createPluginOAuthPermissionRegistry } from './cloudflare-plugin-permission-registry.js';

test('host adapter reads the configured Cloudflare provider plugin permission authority', async () => {
  let sql = '';
  let args = [];
  const env = {
    DB: {
      prepare(statement) {
        sql = statement;
        return {
          bind(...values) {
            args = values;
            return {
              first: async () => ({
                id: 'plg_root',
                plugin_key: 'agentsam-mcp',
                config_json: JSON.stringify({
                  oauth_permissions: {
                    version: 1,
                    baseline_scopes: ['offline_access'],
                    default_packs: ['watch'],
                    allow_full_catalog_opt_in: true,
                    aliases: { media: ['store', 'create'] },
                    packs: [
                      { id: 'watch', label: 'Watch', read_scopes: ['workers-tail.read'], write_scopes: [] },
                      { id: 'store', label: 'Store', read_scopes: ['d1.read'], write_scopes: ['d1.write'] },
                      { id: 'create', label: 'Create', read_scopes: ['images.read'], write_scopes: ['images.write'] },
                    ],
                    capabilities: [{ id: 'cloudflare.r2', scopes: ['workers-r2.read', 'workers-r2.write'] }],
                    available_permissions: [{ scope: 'access-policy.read', label: 'Read Access Policies', category: 'zero-trust' }],
                  },
                }),
              }),
            };
          },
        };
      },
    },
  };
  const catalog = await createPluginOAuthPermissionRegistry(env).getOAuthPermissionCatalog('cloudflare');
  assert.deepEqual(args, ['agentsam-mcp', 'cloudflare']);
  assert.match(sql, /plugin_key=\?/);
  assert.equal(catalog.pluginId, 'plg_root');
  assert.equal(catalog.pluginKey, 'agentsam-mcp');
  assert.deepEqual(catalog.baselineScopes, ['offline_access']);
  assert.deepEqual(catalog.defaultPacks, ['watch']);
  assert.equal(catalog.allowFullCatalogOptIn, true);
  assert.deepEqual(catalog.packs.find((pack) => pack.id === 'store').scopes, ['d1.read', 'd1.write']);
  assert.ok(catalog.availablePermissions.some((permission) => permission.scope === 'images.write'));
  assert.ok(catalog.availablePermissions.some((permission) => permission.scope === 'access-policy.read' && permission.label === 'Read Access Policies'));
});

test('host adapter fails closed if the configured plugin permission catalog is missing or malformed', async () => {
  for (const row of [
    null,
    { id: 'plg_root', plugin_key: 'agentsam-mcp', config_json: '{"oauth_permissions":{"version":2}}' },
    { id: 'plg_root', plugin_key: 'agentsam-mcp', config_json: '{invalid-json' },
  ]) {
    const env = {
      DB: {
        prepare: () => ({
          bind: () => ({ first: async () => row }),
        }),
      },
    };
    assert.equal(await createPluginOAuthPermissionRegistry(env).getOAuthPermissionCatalog('cloudflare'), null);
  }
});

test('host adapter can map another provider to a different registered plugin key', async () => {
  let args = [];
  const env = {
    DB: {
      prepare: () => ({
        bind: (...values) => {
          args = values;
          return {
            first: async () => ({
              id: 'plg_other',
              plugin_key: 'my-google-connector',
              config_json: JSON.stringify({
                oauth_permissions: {
                  version: 1,
                  default_scopes: ['profile'],
                  available_scopes: ['profile'],
                },
              }),
            }),
          };
        },
      }),
    },
  };
  const catalog = await createPluginOAuthPermissionRegistry(env, {
    pluginKeys: { google: 'my-google-connector' },
  }).getOAuthPermissionCatalog('google');
  assert.deepEqual(args, ['my-google-connector', 'google']);
  assert.equal(catalog.pluginKey, 'my-google-connector');
});

test('host adapter does not assume a database binding exists', async () => {
  assert.equal(await createPluginOAuthPermissionRegistry({}).getOAuthPermissionCatalog('cloudflare'), null);
});

