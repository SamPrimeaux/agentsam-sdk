import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../backend/migrations/1383_growth_plugin_screen_registration.sql', import.meta.url), 'utf8');

test('Growth screen registration extends the existing plugin metadata and installation without replacing settings', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE agentsam_plugins (id TEXT PRIMARY KEY, plugin_key TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE agentsam_plugin_installations (
      id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, account_id TEXT NOT NULL,
      instance_key TEXT NOT NULL DEFAULT 'default', enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO agentsam_plugins(id,plugin_key,metadata_json)
      VALUES ('plg-growth','agentsam-app-growth','{"app":{"nav":{"label":"Growth","href":"/admin/growth","icon":"growth"},"surfaces":["admin-nav"],"skills":[]}}');
    INSERT INTO agentsam_plugin_installations(id,plugin_id,account_id,instance_key,enabled,config_json)
      VALUES ('pinst-growth','plg-growth','account-1','default',1,'{"custom":{"keep":true}}');
  `);
  db.exec(migration);
  const plugin = JSON.parse(db.prepare("SELECT metadata_json FROM agentsam_plugins WHERE plugin_key='agentsam-app-growth'").get().metadata_json);
  const installation = JSON.parse(db.prepare("SELECT config_json FROM agentsam_plugin_installations WHERE id='pinst-growth'").get().config_json);
  assert.equal(plugin.app.nav.href, '/admin/growth');
  assert.deepEqual(plugin.app.surfaces, ['channels']);
  assert.deepEqual(installation.custom, { keep: true });
  assert.equal(installation.runtime.manifest_id, 'ecommerce-cms-agentsam');
  assert.deepEqual(installation.runtime.screen_ids, ['growth.workspace']);
  db.exec(migration);
  assert.deepEqual(JSON.parse(db.prepare("SELECT config_json FROM agentsam_plugin_installations WHERE id='pinst-growth'").get().config_json), installation);
  db.close();
});
