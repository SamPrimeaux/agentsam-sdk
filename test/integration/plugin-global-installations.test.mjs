import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { listPluginTools } from '../../src/plugins/registry.js';

function makeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE agentsam_tools (
      id TEXT PRIMARY KEY, tool_key TEXT NOT NULL, plugin_id TEXT, plugin_key TEXT,
      account_id TEXT, is_active INTEGER NOT NULL DEFAULT 1,
      connector_priority INTEGER NOT NULL DEFAULT 0, sort_priority INTEGER NOT NULL DEFAULT 0,
      tool_name TEXT NOT NULL, input_schema TEXT NOT NULL DEFAULT '{}',
      output_schema TEXT, handler_config TEXT NOT NULL DEFAULT '{}', intent_tags TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE agentsam_plugin_installations (
      account_id TEXT NOT NULL, plugin_id TEXT NOT NULL, instance_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO agentsam_tools (id, tool_key, plugin_id, plugin_key, account_id, tool_name) VALUES
      ('gmail', 'gmail.list', 'google-gmail','google-gmail',NULL,'gmail_list'),
      ('private-a','custom.a','custom','custom','account-a','custom_tool_a'),
      ('private-b','custom.b','custom','custom','account-b','custom_tool_b'),
      ('unlinked','unlinked','uninstalled',NULL,NULL,'unlinked_tool'),
      ('disabled','disabled','disabled',NULL,NULL,'disabled_tool');
    INSERT INTO agentsam_plugin_installations VALUES
      ('account-a','google-gmail','primary',1),
      ('account-a','google-gmail','secondary',1),
      ('account-b','google-gmail','default',0),
      ('account-a','custom','default',1),
      ('account-b','custom','default',1),
      ('account-a','disabled','default',0);
  `);
  const db = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        bind(...args) {
          return { all() { return {results: stmt.all(...args)}; } };
        },
      };
    },
  };
  return { sqlite, db };
}

test('global plugin tools are available only through matching account installations', async () => {
  const { sqlite, db } = makeDb();
  try {
    const accountA = await listPluginTools(db,{accountId:'account-a'});
    assert.deepEqual(accountA.map(t=>t.id).sort(),['gmail','private-a']);
    assert.deepEqual((await listPluginTools(db,{accountId:'account-b'})).map(t=>t.id), ['private-b']);
    assert.deepEqual((await listPluginTools(db,{accountId:'account-c'})), []);
    assert.deepEqual((await listPluginTools(db,{accountId:'account-a',includeDisabledPlugins:true}))
      .map(t=>t.id).sort(),['disabled','gmail','private-a']);
    assert.deepEqual((await listPluginTools(db,{accountId:'account-b',includeDisabledPlugins:true}))
      .map(t=>t.id).sort(),['gmail','private-b']);
    assert.equal(accountA.filter(t=>t.id==='gmail').length,1,'multiple installations must not duplicate tool');
    assert.deepEqual(accountA.find(t=>t.id==='gmail').input_schema, {});
  } finally { sqlite.close(); }
});
