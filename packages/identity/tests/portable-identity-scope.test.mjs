import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { applyPortableIdentityMigrations } from '../migrations/apply-portable.js';
import { createPortableD1IdentityAdapter } from '../src/adapters/portable-d1/index.js';

function d1(sqlite) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async run() { const result = sqlite.prepare(sql).run(...params); return { meta: { changes: result.changes } }; },
      };
      return statement;
    },
  };
}

test('portable Identity scopes customer users and sessions per storefront without mirroring merchant accounts', async () => {
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
    await applyPortableIdentityMigrations(sqlite, { includeAccountMirror: false });

    const db = d1(sqlite);
    const firstStore = createPortableD1IdentityAdapter(db, { scopeId: 'cms-site-a', mirrorAccounts: false });
    const secondStore = createPortableD1IdentityAdapter(db, { scopeId: 'cms-site-b', mirrorAccounts: false });
    const email = 'customer@example.test';
    const firstUser = await firstStore.createUser({ email, passwordHash: 'hash-a', salt: 'salt-a', displayName: 'Customer A' });
    const secondUser = await secondStore.createUser({ email, passwordHash: 'hash-b', salt: 'salt-b', displayName: 'Customer B' });

    assert.notEqual(firstUser.id, secondUser.id);
    assert.equal((await firstStore.findUserByEmail(email)).id, firstUser.id);
    assert.equal((await secondStore.findUserByEmail(email)).id, secondUser.id);
    assert.equal(await firstStore.findUserById(secondUser.id), null);

    const firstSession = await firstStore.createSession({ userId: firstUser.id, email, provider: 'email' });
    assert.equal((await firstStore.getSession(firstSession.id)).user_id, firstUser.id);
    assert.equal(await secondStore.getSession(firstSession.id), null);
    await secondStore.revokeSession(firstSession.id, 'logout');
    assert.equal((await firstStore.getSession(firstSession.id)).user_id, firstUser.id);

    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM accounts").get().count, 1);
    assert.equal(Number(sqlite.prepare("SELECT value FROM identity_schema_meta WHERE key='schema_version'").get().value), 3);
  } finally {
    sqlite.close();
  }
});
