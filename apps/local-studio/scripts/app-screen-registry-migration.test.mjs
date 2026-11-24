import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../backend/migrations/1382_app_screen_registry.sql', import.meta.url), 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE apps (id TEXT PRIMARY KEY, config_json TEXT NOT NULL DEFAULT \'{}\')');
  const insert = db.prepare('INSERT INTO apps (id, config_json) VALUES (?, ?)');
  insert.run('ecommerce-cms-agentsam', '{}');
  insert.run('agentsamforms', JSON.stringify({ site_scoped: 1, surface: 'merchant-storefront' }));
  insert.run('database-editor', '{}');
  insert.run('cad-creator', '{}');
  insert.run('design-canvas', '{}');
  insert.run('goalguru', '{}');
  insert.run('moviemode', '{}');
  insert.run('samsketch', '{}');
  insert.run('unrelated-app', JSON.stringify({ retained: true }));
  return db;
}

test('D1 app screen registration merges into the existing apps catalog without replacing app config', () => {
  const db = database();
  db.exec(migration);
  const rows = new Map(db.prepare('SELECT id, config_json FROM apps').all().map(row => [row.id, JSON.parse(row.config_json)]));

  assert.deepEqual(rows.get('ecommerce-cms-agentsam').runtime.screen_ids, [
    'ecommerce-cms-agentsam.store', 'ecommerce-cms-agentsam.pages',
    'ecommerce-cms-agentsam.structure', 'ecommerce-cms-agentsam.preferences',
    'ecommerce-cms-agentsam.products', 'ecommerce-cms-agentsam.collections',
    'ecommerce-cms-agentsam.product-create', 'ecommerce-cms-agentsam.inventory',
    'ecommerce-cms-agentsam.orders', 'ecommerce-cms-agentsam.discounts',
    'ecommerce-cms-agentsam.audience',
  ]);
  assert.equal(rows.get('ecommerce-cms-agentsam').runtime.manifest_id, 'ecommerce-cms-agentsam');
  assert.equal(rows.get('agentsamforms').site_scoped, 1);
  assert.equal(rows.get('agentsamforms').surface, 'merchant-storefront');
  assert.deepEqual(rows.get('agentsamforms').runtime.screen_ids, ['agentsamforms.page']);
  assert.deepEqual(rows.get('database-editor').runtime.screen_ids, ['database-editor.workspace']);
  assert.equal(rows.has('growth'), false, 'Growth is registered through its existing plugin installation, not a fabricated apps row');
  assert.deepEqual(rows.get('unrelated-app'), { retained: true });

  db.exec(migration);
  const after = db.prepare("SELECT config_json FROM apps WHERE id='agentsamforms'").get();
  assert.deepEqual(JSON.parse(after.config_json), rows.get('agentsamforms'), 'the D1 registration migration is repeatable');
  db.close();
});
