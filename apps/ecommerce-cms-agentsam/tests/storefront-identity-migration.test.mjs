import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '../..');
const migrationPath = path.join(appRoot, 'db/migrations/011_storefront_identity.sql');
const identityMigrationRoot = path.join(repoRoot, 'packages/identity/migrations/sqlite');
const sourceFiles = [
  '001_identity_core.sql',
  '002_identity_oauth_client.sql',
  '005_identity_company_native.sql',
  '006_identity_account_security.sql',
  '007_identity_session_revoke_reason.sql',
  '009_identity_scope.sql',
];

test('Ecommerce Identity migration is generated from the canonical package and excludes merchant accounts migration', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  for (const file of sourceFiles) {
    const source = (await readFile(path.join(identityMigrationRoot, file), 'utf8')).trim();
    assert.ok(migration.includes(source), `missing canonical Identity migration ${file}`);
  }
  assert.ok(!migration.includes('-- Source: packages/identity/migrations/sqlite/008_identity_accounts.sql'));
  assert.ok(!migration.includes('INSERT OR IGNORE INTO accounts'));
  assert.match(migration, /Customer identities are isolated by cms_sites\.id through identity scope_id/);
});

test('Ecommerce Identity migration preserves the merchant accounts table and creates site-scoped customer identity tables', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(`CREATE TABLE accounts (
      id TEXT PRIMARY KEY NOT NULL,
      account_key TEXT,
      display_name TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT
    )`);
    sqlite.prepare("INSERT INTO accounts (id, account_key) VALUES ('merchant-account', 'merchant')").run();
    sqlite.exec(await readFile(migrationPath, 'utf8'));

    const accountColumns = sqlite.prepare('PRAGMA table_info(accounts)').all().map((column) => column.name);
    assert.deepEqual(accountColumns, ['id', 'account_key', 'display_name', 'status', 'created_at', 'updated_at']);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM accounts').get().count, 1);
    assert.ok(sqlite.prepare('PRAGMA table_info(identity_users)').all().some((column) => column.name === 'scope_id'));
    assert.equal(Number(sqlite.prepare("SELECT value FROM identity_schema_meta WHERE key='schema_version'").get().value), 3);
  } finally {
    sqlite.close();
  }
});
