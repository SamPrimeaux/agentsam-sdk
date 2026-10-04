import assert from 'node:assert/strict';
import test from 'node:test';
import { installPlugin, updatePluginPreferences } from '../../src/plugins/registry.js';

test('plugin preferences update is account scoped and returns normalized registry data', async () => {
  let mutation = null;
  const db = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async run() {
          mutation = { sql, args: this.args };
          return { success: true };
        },
        async first() {
          return {
            id: 'plg_demo',
            account_id: 'acct_1',
            plugin_key: 'demo',
            is_enabled: 0,
            composer_visible: 1,
            settings_visible: 1,
            mention_aliases_json: '["@demo"]',
            capabilities_json: '["demo.read"]',
            tool_lanes_json: '["typed"]',
            resource_scope_json: '{}',
            config_json: '{}',
            metadata_json: '{}',
          };
        },
      };
    },
  };

  const result = await updatePluginPreferences(db, {
    accountId: 'acct_1',
    pluginId: 'plg_demo',
    enabled: false,
  });

  assert.match(mutation.sql, /WHERE id=\? AND account_id=\?/);
  assert.deepEqual(mutation.args.slice(-2), ['plg_demo', 'acct_1']);
  assert.equal(result.is_enabled, 0);
  assert.deepEqual(result.capabilities, ['demo.read']);
});

test('plugin preferences refuse empty mutations', async () => {
  const db = { prepare() { throw new Error('should_not_prepare'); } };
  await assert.rejects(
    updatePluginPreferences(db, { accountId: 'acct_1', pluginId: 'plg_demo' }),
    /plugin_preferences_empty/,
  );
});


test('registry refresh can preserve an explicit plugin enable preference', async () => {
  const mutations = [];
  const db = {
    prepare(sql) {
      return {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          if (sql.includes('SELECT id FROM agentsam_plugins')) return { id: 'plg_demo' };
          return null;
        },
        async run() {
          mutations.push({ sql, args: this.args });
          return { success: true };
        },
      };
    },
  };

  await installPlugin(db, {
    accountId: 'acct_1',
    preserveEnabled: true,
    manifest: {
      plugin_key: 'demo',
      provider_key: 'demo',
      plugin_kind: 'api',
      category: 'test',
      display_name: 'Demo',
      transport: 'http_rest',
      auth_type: 'none',
      capabilities: [],
      tool_lanes: [],
      tools: [],
    },
  });

  const pluginUpdate = mutations.find((entry) => entry.sql.includes('UPDATE agentsam_plugins SET'));
  assert.ok(pluginUpdate);
  assert.match(pluginUpdate.sql, /is_enabled=CASE WHEN \? THEN is_enabled ELSE 1 END/);
  assert.equal(pluginUpdate.args.at(-2), 1);
  assert.equal(pluginUpdate.args.at(-1), 'plg_demo');
});
