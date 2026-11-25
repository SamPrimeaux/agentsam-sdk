import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const discoveryMigration = readFileSync(
  new URL('../../apps/local-studio/backend/migrations/1385_service_registry_model_discovery.sql', import.meta.url),
  'utf8',
);

function createBase(db) {
  db.exec('PRAGMA foreign_keys = ON; CREATE TABLE accounts (id TEXT PRIMARY KEY);');
  db.prepare('INSERT INTO accounts (id) VALUES (?)').run('acct_a');
}

test('1385 is D1-only and bootstraps service discovery metadata from the service registry', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createBase(db);
    db.exec(discoveryMigration);

    const columns = db.prepare('PRAGMA table_info(agentsam_service_registry)').all().map((row) => row.name);
    assert.ok(columns.includes('metadata_json'));
    assert.ok(columns.includes('updated_at'));

    const rows = db.prepare(
      'SELECT service_name,metadata_json,updated_at FROM agentsam_service_registry ORDER BY service_name',
    ).all();
    const metadata = new Map(rows.map((row) => [row.service_name, JSON.parse(row.metadata_json)]));
    assert.equal(metadata.get('openai').model_discovery.adapter, 'openai');
    assert.equal(metadata.get('meta').provider_id, 'meta');
    assert.equal(metadata.get('anthropic').model_discovery.enabled, true);
    assert.equal(metadata.get('gemini').model_discovery.adapter, 'gemini');
    assert.equal(metadata.get('google').provider_id, 'gemini');
    assert.equal(metadata.get('xai').model_discovery.adapter, 'xai');
    assert.equal(metadata.get('cursor').model_discovery.adapter, 'cursor');
    assert.equal(metadata.get('meshy').model_discovery.enabled, false);
    assert.equal(metadata.get('tavily').model_discovery.enabled, false);
    assert.ok(rows.every((row) => row.updated_at > 0));

    const preferenceColumns = db.prepare('PRAGMA table_info(agentsam_user_ui_preferences)').all().map((row) => row.name);
    assert.deepEqual(preferenceColumns, ['account_id', 'ui_preferences_json', 'updated_at']);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='agentsam_account_provider_models'").get().n, 0);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
  }
});

test('1385 preserves existing account UI preferences instead of replacing the shared JSON authority', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createBase(db);
    db.exec(`
      CREATE TABLE agentsam_user_ui_preferences (
        account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        ui_preferences_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(ui_preferences_json)),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT INTO agentsam_user_ui_preferences (account_id,ui_preferences_json)
      VALUES ('acct_a','{"theme":"charcoal-green-dark","inneranimal_companions":{"activeId":"geaux"}}');
    `);
    const before = db.prepare(
      'SELECT ui_preferences_json,updated_at FROM agentsam_user_ui_preferences WHERE account_id=?',
    ).get('acct_a');
    db.exec(discoveryMigration);
    const after = db.prepare(
      'SELECT ui_preferences_json,updated_at FROM agentsam_user_ui_preferences WHERE account_id=?',
    ).get('acct_a');
    assert.deepEqual(after, before);
  } finally {
    db.close();
  }
});
