/**
 * Session audit evidence: why a session ended, and account-level last-seen.
 * Proven against real SQLite for both schema generations, so a database that
 * predates the audit columns keeps working and one that has them records them.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createIamCompatIdentityAdapter } from '../src/adapters/iam-compat/index.js';
import { hasColumn, normalizeRevokeReason } from '../src/adapters/column-support.js';

function d1Shim(sqlite) {
  const run = (sql, args) => sqlite.prepare(sql).run(...args);
  return {
    sqlite,
    prepare(sql) {
      const bound = (...args) => ({
        first: async () => sqlite.prepare(sql).get(...args) ?? null,
        run: async () => { run(sql, args); return { success: true }; },
        all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      });
      return { bind: (...args) => bound(...args), first: bound().first, run: bound().run, all: bound().all };
    },
  };
}

const BASE = `
  CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, display_name TEXT, status TEXT, created_at INTEGER, updated_at INTEGER%ACCOUNT_EXTRA%);
  CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT, display_name TEXT, password_hash TEXT, salt TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT, provider TEXT, provider_subject TEXT,
    display_name TEXT, expires_at INTEGER NOT NULL, revoked_at INTEGER, created_at INTEGER NOT NULL, last_active_at INTEGER,
    type TEXT NOT NULL DEFAULT 'browser'%SESSION_EXTRA%);
`;

function makeDb({ audit }) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    BASE
      .replace('%ACCOUNT_EXTRA%', audit ? ', last_active_at INTEGER' : '')
      .replace('%SESSION_EXTRA%', audit ? ', revoke_reason TEXT' : ''),
  );
  sqlite.prepare(`INSERT INTO accounts (id, email, status, created_at, updated_at) VALUES ('au_test', 'user123@example.test', 'active', 1, 1)`).run();
  sqlite.prepare(`INSERT INTO auth_users (id, email, status, created_at, updated_at) VALUES ('au_test', 'user123@example.test', 'active', 1, 1)`).run();
  return d1Shim(sqlite);
}

describe('normalizeRevokeReason', () => {
  it('defaults to logout and keeps a bounded single-token reason', () => {
    assert.equal(normalizeRevokeReason(undefined), 'logout');
    assert.equal(normalizeRevokeReason('  PKCE verification failed '), 'pkce_verification_failed');
    assert.equal(normalizeRevokeReason('x'.repeat(200)).length, 64);
  });
});

describe('IAM-shaped adapter with audit columns', () => {
  it('records the revoke reason and account last_active_at', async () => {
    const db = makeDb({ audit: true });
    const adapter = createIamCompatIdentityAdapter(db);
    const session = await adapter.createSession({ userId: 'au_test', email: 'user123@example.test', provider: 'google' });
    const account = db.sqlite.prepare(`SELECT last_active_at FROM accounts WHERE id = 'au_test'`).get();
    assert.equal(account.last_active_at, session.created_at);

    const result = await adapter.revokeSession(session.id, 'logout');
    assert.deepEqual(result, { ok: true, reason: 'logout' });
    const row = db.sqlite.prepare(`SELECT revoked_at, revoke_reason FROM auth_sessions WHERE id = ?`).get(session.id);
    assert.ok(Number.isInteger(row.revoked_at), 'revoked_at is integer epoch seconds');
    assert.equal(row.revoke_reason, 'logout');
    assert.equal(await adapter.getSession(session.id), null);
  });

  it('distinguishes why a session ended', async () => {
    const db = makeDb({ audit: true });
    const adapter = createIamCompatIdentityAdapter(db);
    const a = await adapter.createSession({ userId: 'au_test' });
    const b = await adapter.createSession({ userId: 'au_test' });
    await adapter.revokeSession(a.id, 'pkce_verification_failed');
    await adapter.revokeSession(b.id, 'native_handoff_invalid');
    const rows = db.sqlite.prepare(`SELECT id, revoke_reason FROM auth_sessions`).all();
    assert.equal(rows.find((r) => r.id === a.id).revoke_reason, 'pkce_verification_failed');
    assert.equal(rows.find((r) => r.id === b.id).revoke_reason, 'native_handoff_invalid');
  });

  it('does not overwrite the reason of an already revoked session', async () => {
    const db = makeDb({ audit: true });
    const adapter = createIamCompatIdentityAdapter(db);
    const s = await adapter.createSession({ userId: 'au_test' });
    await adapter.revokeSession(s.id, 'logout');
    await adapter.revokeSession(s.id, 'something_else');
    assert.equal(db.sqlite.prepare(`SELECT revoke_reason FROM auth_sessions WHERE id = ?`).get(s.id).revoke_reason, 'logout');
  });
});

describe('IAM-shaped adapter on a database that predates the audit columns', () => {
  it('still creates and revokes sessions without throwing', async () => {
    const db = makeDb({ audit: false });
    const adapter = createIamCompatIdentityAdapter(db);
    const session = await adapter.createSession({ userId: 'au_test' });
    assert.equal(await hasColumn(db, 'auth_sessions', 'revoke_reason'), false);
    const result = await adapter.revokeSession(session.id, 'logout');
    assert.equal(result.ok, true);
    assert.ok(db.sqlite.prepare(`SELECT revoked_at FROM auth_sessions WHERE id = ?`).get(session.id).revoked_at);
  });

  it('picks the column up once a migration adds it, without a restart', async () => {
    const db = makeDb({ audit: false });
    const adapter = createIamCompatIdentityAdapter(db);
    const first = await adapter.createSession({ userId: 'au_test' });
    await adapter.revokeSession(first.id, 'logout');
    db.sqlite.exec('ALTER TABLE auth_sessions ADD COLUMN revoke_reason TEXT');
    const second = await adapter.createSession({ userId: 'au_test' });
    await adapter.revokeSession(second.id, 'logout');
    assert.equal(db.sqlite.prepare(`SELECT revoke_reason FROM auth_sessions WHERE id = ?`).get(second.id).revoke_reason, 'logout');
  });
});

describe('portable identity_* adapter', () => {
  it('records the revoke reason after migrations are applied', async () => {
    const { mkdtempSync } = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { createLocalSqliteDatabase } = await import('../../../src/local/sqlite.js');
    const { applyPortableIdentityMigrations, createSqliteIdentityAdapter } = await import('../src/adapters/sqlite/index.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'identity-audit-'));
    const db = await createLocalSqliteDatabase(path.join(dir, 'identity.sqlite'));
    await applyPortableIdentityMigrations(db);
    const adapter = createSqliteIdentityAdapter(db);
    const user = await adapter.createUser({ email: 'user123@example.test', displayName: 'User 123', passwordHash: 'h', salt: 's' });
    const session = await adapter.createSession({ userId: user.id, email: user.email });
    const result = await adapter.revokeSession(session.id, 'logout');
    assert.deepEqual(result, { ok: true, reason: 'logout' });
    const row = await db.prepare('SELECT revoked_at, revoke_reason FROM identity_sessions WHERE id = ?').bind(session.id).first();
    assert.equal(row.revoke_reason, 'logout');
    assert.ok(Number.isInteger(row.revoked_at));
  });
});
