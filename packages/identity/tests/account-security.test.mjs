/**
 * Self-service account API (profile, sessions, backup codes, company authority)
 * driven through the real Worker router against BOTH real adapters on SQLite:
 *   - portable identity_* schema (applyPortableIdentityMigrations)
 *   - IAM production-shaped fixture (column types copied from hosted auth tables)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { createLocalSqliteDatabase } from '../../../src/local/sqlite.js';
import { applyPortableIdentityMigrations, createSqliteIdentityAdapter } from '../src/adapters/sqlite/index.js';
import { createIamCompatIdentityAdapter } from '../src/adapters/iam-compat/index.js';
import { handleIdentityWorkerRequest } from '../src/server/worker-router.js';
import { hashPassword } from '../src/core/password-crypto.js';
import {
  canonicalBackupCode,
  generateBackupCodes,
  sha256Hex,
  validateProfilePatch,
} from '../src/core/account-security.js';

const PASSWORD = 'correct-horse-battery';

/** D1-shaped wrapper that reports row changes like D1 does. */
function wrap(sqlite) {
  const exec = (sql, args, mode) => {
    const stmt = sqlite.prepare(sql);
    if (mode === 'first') return stmt.get(...args) ?? null;
    if (mode === 'all') return { results: stmt.all(...args) };
    const info = stmt.run(...args);
    return { success: true, meta: { changes: Number(info.changes) } };
  };
  const prepared = (sql, args = []) => ({
    bind: (...next) => prepared(sql, next),
    first: async () => exec(sql, args, 'first'),
    all: async () => exec(sql, args, 'all'),
    run: async () => exec(sql, args, 'run'),
  });
  return {
    prepare: (sql) => prepared(sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        sqlite.exec('COMMIT');
        return out;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
  };
}

function iamProductionShapedSql() {
  return `
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'human', email TEXT UNIQUE,
  display_name TEXT NOT NULL, avatar_url TEXT, password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active', plan TEXT NOT NULL DEFAULT 'free',
  timezone TEXT NOT NULL DEFAULT 'America/Chicago', meta_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_active_at INTEGER, notification_email TEXT);
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT NOT NULL, salt TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
  is_superadmin INTEGER DEFAULT 0, status TEXT DEFAULT 'active', display_name TEXT, avatar_url TEXT,
  timezone TEXT DEFAULT 'America/Chicago', role TEXT NOT NULL DEFAULT 'member', notification_email TEXT);
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')), email TEXT, provider TEXT DEFAULT 'email',
  display_name TEXT, revoked_at TEXT, provider_subject TEXT, last_active_at INTEGER,
  type TEXT NOT NULL DEFAULT 'browser');
CREATE TABLE user_backup_codes (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code_hash TEXT NOT NULL, used_at INTEGER, created_at INTEGER,
  person_uuid TEXT, used INTEGER DEFAULT 0, expires_at INTEGER);
CREATE TABLE auth_event_log (
  id TEXT PRIMARY KEY, user_id TEXT, account_id TEXT, event_type TEXT, status TEXT, provider TEXT,
  ip_hash TEXT, user_agent_hash TEXT, metadata_json TEXT, created_at INTEGER);
CREATE TABLE company (
  id TEXT PRIMARY KEY NOT NULL, slug TEXT NOT NULL, name TEXT NOT NULL, legal_name TEXT, logo_url TEXT,
  favicon_url TEXT, primary_color TEXT, auth_bg_color TEXT, support_email TEXT, website_url TEXT,
  tagline TEXT, meta_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
`;
}

/** Minimal identity facade over a REAL adapter (bearer session → adapter.getSession). */
function identityFor(adapter) {
  return {
    app: { id: 'app.example.test' },
    routeRegistry: { resolve: () => '/auth/login' },
    async sessionFromRequest(request) {
      const sessionId = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      if (!sessionId) return null;
      const session = await adapter.getSession(sessionId);
      if (!session) return null;
      const user = await adapter.findUserById(session.user_id);
      return user ? { session, user, sessionId } : null;
    },
    isNativeSessionRequest: () => true,
    buildNativeLoginSuccessResponse: (result) => new Response(
      JSON.stringify({ ok: true, session_id: result.sessionId }),
      { headers: { 'content-type': 'application/json' } },
    ),
  };
}

function call(adapter, method, pathname, { session, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (session) headers.Authorization = `Bearer ${session}`;
  return handleIdentityWorkerRequest(
    new Request(`https://example.test${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    {},
    { adapter, identity: identityFor(adapter), passwordReset: {} },
  );
}

async function seedUser(adapter, email) {
  const { saltHex, hashHex } = await hashPassword(PASSWORD);
  const user = await adapter.createUser({ email, passwordHash: hashHex, salt: saltHex, displayName: 'Owner' });
  const session = await adapter.createSession({ userId: user.id, email, displayName: 'Owner', provider: 'email' });
  return { user, session: session.id };
}

async function runAccountSuite(adapter, label) {
  const owner = await seedUser(adapter, `owner-${label}@example.test`);
  const member = await seedUser(adapter, `member-${label}@example.test`);

  // Unauthenticated access is refused.
  assert.equal((await call(adapter, 'GET', '/api/account')).status, 401);

  // Overview.
  let res = await call(adapter, 'GET', '/api/account', { session: owner.session });
  assert.equal(res.status, 200, `${label}: overview`);
  let body = await res.json();
  assert.equal(body.account.profile.email, `owner-${label}@example.test`);
  assert.equal(body.account.security.hasPassword, true);
  assert.equal(body.account.security.backupCodes.remaining, 0);

  // Profile update with validation.
  res = await call(adapter, 'PATCH', '/api/account/profile', {
    session: owner.session, body: { avatarUrl: 'http://insecure.example/a.png' },
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'avatar_url_must_be_https');
  res = await call(adapter, 'PATCH', '/api/account/profile', {
    session: owner.session,
    body: { displayName: 'Renamed Owner', timezone: 'Europe/Paris', notificationEmail: 'alerts@example.test' },
  });
  assert.equal(res.status, 200, `${label}: profile`);
  body = await res.json();
  assert.equal(body.profile.displayName, 'Renamed Owner');
  assert.equal(body.profile.timezone, 'Europe/Paris');
  assert.equal(body.profile.notificationEmail, 'alerts@example.test');

  // Sessions: second device, list, revoke it, cannot revoke someone else's.
  const second = await adapter.createSession({ userId: owner.user.id, email: owner.user.email, provider: 'email' });
  res = await call(adapter, 'GET', '/api/account/sessions', { session: owner.session });
  body = await res.json();
  assert.equal(body.sessions.length, 2);
  assert.equal(body.sessions.filter((s) => s.current).length, 1);
  assert.ok(body.sessions.every((s) => !('provider_subject' in s)));
  res = await call(adapter, 'DELETE', `/api/account/sessions/${member.session}`, { session: owner.session });
  assert.equal(res.status, 404, `${label}: cross-user revoke must not succeed`);
  assert.ok(await adapter.getSession(member.session), 'member session untouched');
  res = await call(adapter, 'DELETE', `/api/account/sessions/${owner.session}`, { session: owner.session });
  assert.equal(res.status, 400);
  res = await call(adapter, 'DELETE', `/api/account/sessions/${second.id}`, { session: owner.session });
  assert.equal(res.status, 200);
  assert.equal(await adapter.getSession(second.id), null);
  const third = await adapter.createSession({ userId: owner.user.id, email: owner.user.email, provider: 'email' });
  res = await call(adapter, 'POST', '/api/account/sessions/revoke-others', { session: owner.session });
  assert.equal((await res.json()).revoked, 1);
  assert.equal(await adapter.getSession(third.id), null);
  assert.ok(await adapter.getSession(owner.session));

  // Backup codes: password required, plaintext returned once, digests stored.
  res = await call(adapter, 'POST', '/api/account/backup-codes', { session: owner.session, body: {} });
  assert.equal(res.status, 400);
  res = await call(adapter, 'POST', '/api/account/backup-codes', {
    session: owner.session, body: { current_password: 'wrong-password' },
  });
  assert.equal(res.status, 403);
  res = await call(adapter, 'POST', '/api/account/backup-codes', {
    session: owner.session, body: { current_password: PASSWORD },
  });
  assert.equal(res.status, 200, `${label}: generate codes`);
  body = await res.json();
  assert.equal(body.codes.length, 10);
  assert.equal(body.backupCodes.remaining, 10);
  assert.ok(body.codes.every((c) => /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(c)));
  const [first, secondCode] = body.codes;

  // Backup-code login: wrong code, other user's email, then success (lower-case, no dashes).
  res = await call(adapter, 'POST', '/api/auth/backup-code', { body: { email: owner.user.email, code: 'AAAA-AAAA-AAAA' } });
  assert.equal(res.status, 401);
  res = await call(adapter, 'POST', '/api/auth/backup-code', { body: { email: member.user.email, code: first } });
  assert.equal(res.status, 401, `${label}: code is bound to its owner`);
  res = await call(adapter, 'POST', '/api/auth/backup-code', {
    body: { email: owner.user.email.toUpperCase(), code: first.replace(/-/g, '').toLowerCase() },
  });
  assert.equal(res.status, 200, `${label}: backup login`);
  const login = await res.json();
  assert.ok(await adapter.getSession(login.session_id));
  // Single use.
  res = await call(adapter, 'POST', '/api/auth/backup-code', { body: { email: owner.user.email, code: first } });
  assert.equal(res.status, 401);
  res = await call(adapter, 'GET', '/api/account/backup-codes', { session: owner.session });
  assert.equal((await res.json()).backupCodes.remaining, 9);

  // Regeneration invalidates every prior code.
  await call(adapter, 'POST', '/api/account/backup-codes', { session: owner.session, body: { current_password: PASSWORD } });
  res = await call(adapter, 'POST', '/api/auth/backup-code', { body: { email: owner.user.email, code: secondCode } });
  assert.equal(res.status, 401, `${label}: regenerated set replaces old codes`);

  return { owner, member };
}

describe('account self-service API', () => {
  it('validates profile patches', () => {
    assert.deepEqual(validateProfilePatch({ displayName: '  Sam  ' }), { ok: true, patch: { displayName: 'Sam' } });
    assert.equal(validateProfilePatch({ displayName: '' }).error, 'display_name_required');
    assert.equal(validateProfilePatch({ timezone: 'Mars/Olympus' }).error, 'timezone_invalid');
    assert.equal(validateProfilePatch({ notificationEmail: 'nope' }).error, 'notification_email_invalid');
    assert.deepEqual(validateProfilePatch({ notificationEmail: '' }).patch, { notificationEmail: null });
  });

  it('generates unique, canonical backup codes', () => {
    const codes = generateBackupCodes(10);
    assert.equal(new Set(codes).size, 10);
    assert.equal(canonicalBackupCode(' ab12 cd34-ef56 '), 'AB12-CD34-EF56');
    assert.equal(canonicalBackupCode('short'), null);
  });

  it('portable SQLite adapter', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-account-'));
    const db = await createLocalSqliteDatabase(path.join(dir, 'identity.sqlite'));
    await applyPortableIdentityMigrations(db);
    const adapter = createSqliteIdentityAdapter(db);
    const { owner, member } = await runAccountSuite(adapter, 'portable');
    // Installation owner (first user) may brand the company; others may not.
    assert.equal(await adapter.canManageCompany(owner.user.id), true);
    assert.equal(await adapter.canManageCompany(member.user.id), false);
  });

  it('IAM-compat adapter on a production-shaped schema, compatible with legacy codes', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(iamProductionShapedSql());
    const adapter = createIamCompatIdentityAdapter(wrap(sqlite));
    const { owner, member } = await runAccountSuite(adapter, 'iam');

    // accounts row of record mirrors the profile.
    const acct = sqlite.prepare('SELECT display_name, timezone FROM accounts WHERE id = ?').get(owner.user.id);
    assert.equal(acct.display_name, 'Renamed Owner');
    assert.equal(acct.timezone, 'Europe/Paris');

    // A code issued by the legacy onboarding flow (hash of the displayed code) still works.
    sqlite.prepare('INSERT INTO user_backup_codes (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, NULL, 1)')
      .run('ubc_legacy', member.user.id, await sha256Hex('K7PQ-2M9X-HT4W'));
    const res = await call(adapter, 'POST', '/api/auth/backup-code', {
      body: { email: member.user.email, code: 'k7pq-2m9x-ht4w' },
    });
    assert.equal(res.status, 200);

    // Company branding: members forbidden, superadmins allowed.
    let patch = await call(adapter, 'PATCH', '/api/company', { session: member.session, body: { name: 'Hijacked' } });
    assert.equal(patch.status, 403);
    sqlite.prepare('UPDATE auth_users SET is_superadmin = 1 WHERE id = ?').run(owner.user.id);
    assert.equal(await adapter.canManageCompany(owner.user.id), true);
  });

  it('reports a missing account-security schema honestly instead of 500', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(iamProductionShapedSql());
    sqlite.exec('DROP TABLE user_backup_codes');
    const adapter = createIamCompatIdentityAdapter(wrap(sqlite));
    const { session } = await seedUser(adapter, 'nocodes@example.test');
    const res = await call(adapter, 'GET', '/api/account/backup-codes', { session });
    assert.equal(res.status, 501);
    assert.equal((await res.json()).error, 'account_security_migration_required');
  });
});

describe('password reset email resolves its key through the injected vault resolver', () => {
  it('uses the host company credential reference, not env', async () => {
    const sent = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      sent.push({ url: String(url), auth: init.headers.Authorization, body: JSON.parse(init.body) });
      return new Response('{}', { status: 200 });
    };
    const kv = new Map();
    const company = {
      name: 'Portal Co', supportEmail: 'help@portal.test',
      meta: { credentials: { transactional_email: { provider: 'resend', vault_account_id: 'acct_owner' } } },
    };
    const adapter = {
      findUserByEmail: async () => ({ id: 'u1', email: 'u@portal.test', display_name: 'U', status: 'active' }),
      getCompanyByHost: async (host) => (host === 'portal.test' ? company : null),
      getDefaultCompany: async () => ({ name: 'Default', supportEmail: 'x@default.test', meta: {} }),
    };
    const lookups = [];
    try {
      const res = await handleIdentityWorkerRequest(
        new Request('https://portal.test/api/auth/password-reset/request', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'u@portal.test' }),
        }),
        {
          RESEND_API_KEY: 'env-key-should-not-win',
          SESSION_CACHE: {
            get: async (k) => kv.get(k) ?? null,
            put: async (k, v) => { kv.set(k, v); },
            delete: async (k) => { kv.delete(k); },
          },
        },
        {
          adapter,
          identity: identityFor(adapter),
          resolveCredential: async (q) => { lookups.push(q); return { source: 'vault', value: 'vault-key' }; },
        },
      );
      assert.equal(res.status, 200);
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(lookups[0].provider, 'resend');
    assert.equal(lookups[0].accountId, 'acct_owner');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].auth, 'Bearer vault-key');
    assert.match(sent[0].body.from, /Portal Co <help@portal\.test>/);
  });
});
