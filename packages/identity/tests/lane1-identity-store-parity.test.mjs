/**
 * Lane 1 shared IdentityStore behavioral suite.
 * Adapter factory is the variable; expected behavior is not.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createLocalSqliteDatabase } from '../../../src/local/sqlite.js';
import {
  applyPortableIdentityMigrations,
  createSqliteIdentityAdapter,
  resolveIdentitySchemaPack,
} from '../src/adapters/sqlite/index.js';
import { createPortableD1IdentityAdapter } from '../src/adapters/portable-d1/index.js';
import {
  createIamCompatIdentityAdapter,
  createCloudflareD1Adapter,
} from '../src/adapters/iam-compat/index.js';
import { createPasswordResetService } from '../src/recovery/password-reset.js';
import { IDENTITY_STORE_SCHEMA_VERSION } from '../src/contracts/identity-store.js';
import { SESSION_TYPES } from '../src/core/session-policy.js';

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL_DIR = path.join(PKG, 'migrations', 'sqlite');

const FIXTURE = Object.freeze({
  email: 'user123@example.test',
  displayName: 'User 123',
  companyName: 'Example Company',
  companySlug: 'example',
  host: 'example.test',
  appId: 'app.example.test',
  provider: 'example-idp',
  providerSubject: 'subj_user123',
  credentialRef: 'vault:ref/example-idp/user123',
});

function wrapDatabaseSync(sqlite) {
  return {
    sqlite,
    prepare(sql) {
      const stmt = () => sqlite.prepare(sql);
      const bound = (...args) => ({
        first: async () => stmt().get(...args) ?? null,
        run: async () => {
          stmt().run(...args);
          return { success: true };
        },
        all: async () => ({ results: stmt().all(...args) }),
      });
      return {
        bind: (...args) => bound(...args),
        first: async () => stmt().get() ?? null,
        run: async () => {
          stmt().run();
          return { success: true };
        },
        all: async () => ({ results: stmt().all() }),
      };
    },
    exec(sql) {
      sqlite.exec(sql);
    },
  };
}

function createMemoryKv() {
  const map = new Map();
  return {
    async get(key) {
      const row = map.get(key);
      if (!row) return null;
      if (row.exp && Date.now() > row.exp) {
        map.delete(key);
        return null;
      }
      return row.value;
    },
    async put(key, value, opts = {}) {
      const ttl = opts.expirationTtl ? opts.expirationTtl * 1000 : null;
      map.set(key, { value, exp: ttl ? Date.now() + ttl : null });
    },
    async delete(key) {
      map.delete(key);
    },
  };
}

async function runIdentityStoreSuite(adapter, { label }) {
  const company = await adapter.upsertCompany({
    id: 'co_example',
    slug: FIXTURE.companySlug,
    name: FIXTURE.companyName,
    supportEmail: 'support@example.test',
    websiteUrl: `https://${FIXTURE.host}`,
    meta: { hosts: [FIXTURE.host] },
  });
  assert.equal(company.name, FIXTURE.companyName, label);
  assert.equal((await adapter.getCompanyBySlug(FIXTURE.companySlug))?.name, FIXTURE.companyName);
  assert.equal((await adapter.getCompanyByHost(FIXTURE.host))?.slug, FIXTURE.companySlug);

  const user = await adapter.createUser({
    email: FIXTURE.email,
    displayName: FIXTURE.displayName,
    passwordHash: 'hash_demo',
    salt: 'salt_demo',
  });
  assert.ok(user?.id, label);
  assert.equal((await adapter.findUserByEmail(FIXTURE.email))?.id, user.id);
  assert.equal((await adapter.findUserById(user.id))?.email, FIXTURE.email);

  await adapter.updateUserPassword(user.id, 'hash_rotated', 'salt_rotated');
  assert.equal((await adapter.findUserById(user.id))?.password_hash, 'hash_rotated');

  await adapter.upsertProviderIdentity({
    accountId: user.id,
    provider: FIXTURE.provider,
    providerSubject: FIXTURE.providerSubject,
    email: FIXTURE.email,
  });
  assert.equal(
    (await adapter.findUserByProvider(FIXTURE.provider, FIXTURE.providerSubject))?.id,
    user.id,
  );

  const session = await adapter.createSession({
    userId: user.id,
    email: FIXTURE.email,
    provider: 'email',
    displayName: FIXTURE.displayName,
    type: SESSION_TYPES.BROWSER,
  });
  assert.ok(session?.id);
  assert.equal((await adapter.getSession(session.id))?.user_id, user.id);

  const desktop = await adapter.createSession({
    userId: user.id,
    email: FIXTURE.email,
    provider: FIXTURE.provider,
    providerSubject: FIXTURE.providerSubject,
    type: SESSION_TYPES.DESKTOP,
  });
  assert.equal(desktop.type, SESSION_TYPES.DESKTOP);

  await adapter.createOAuthTransaction({
    state: 'st_user123',
    provider: FIXTURE.provider,
    codeVerifier: 'verifier_user123',
    returnTo: '/home',
    appId: FIXTURE.appId,
  });
  const tx = await adapter.consumeOAuthTransaction('st_user123');
  assert.equal(tx.app_id, FIXTURE.appId);
  assert.equal(tx.return_to, '/home');
  assert.equal(await adapter.consumeOAuthTransaction('st_user123'), null);

  await adapter.createOAuthTransaction({
    state: 'st_native_user123',
    provider: FIXTURE.provider,
    codeVerifier: 'verifier_native',
    returnTo: '/home',
    appId: FIXTURE.appId,
    clientType: SESSION_TYPES.DESKTOP,
    nativeChallenge: 'A'.repeat(43).replace(/A/g, 'a'),
    nativeRedirect: 'exampleapp://auth/callback',
  });
  const nativeTx = await adapter.consumeOAuthTransaction('st_native_user123');
  assert.equal(nativeTx.client_type, SESSION_TYPES.DESKTOP);
  assert.ok(nativeTx.native_challenge);
  assert.ok(nativeTx.native_redirect);

  await assert.rejects(
    () => adapter.createOAuthTransaction({
      state: 'st_missing_app',
      provider: FIXTURE.provider,
      codeVerifier: 'v',
    }),
    (err) => err?.code === 'OAUTH_TRANSACTION_APP_ID_REQUIRED',
  );

  await adapter.logAuthEvent({
    userId: user.id,
    eventType: 'login',
    status: 'ok',
    provider: 'email',
  });
  const activity = await adapter.countAuthActivity(user.id);
  assert.ok(activity.loginCount >= 1);
  assert.ok(activity.activeSessionCount >= 1);

  const handoffHash = createHash('sha256').update('handoff_code_user123').digest('hex');
  await adapter.createNativeHandoff({
    handoffHash,
    sessionId: desktop.id,
    challenge: nativeTx.native_challenge,
  });
  const claimed = await adapter.consumeNativeHandoff(handoffHash);
  assert.equal(claimed.session_id, desktop.id);
  assert.equal(await adapter.consumeNativeHandoff(handoffHash), null);

  const connId = await adapter.upsertProviderConnection({
    userId: user.id,
    provider: FIXTURE.provider,
    credentialRef: FIXTURE.credentialRef,
    grantedScopes: ['openid', 'email'],
    refreshable: true,
  });
  assert.ok(connId);
  const conn = await adapter.getProviderConnection(user.id, FIXTURE.provider);
  assert.equal(conn.credential_ref, FIXTURE.credentialRef);
  assert.deepEqual(conn.granted_scopes, ['openid', 'email']);
  assert.equal(conn.credential_ref.includes('secret'), false);

  // Recovery: same storage-agnostic service against this adapter (injected KV + user hooks).
  const kv = createMemoryKv();
  let emailedCode = null;
  const recovery = createPasswordResetService({
    kv,
    findEligibleUser: async (email) => adapter.findUserByEmail(email),
    hashPassword: async (password) => ({
      saltHex: 'salt_reset',
      hashHex: `hash_${password}`,
    }),
    updatePassword: async (userId, hashHex, saltHex) => {
      await adapter.updateUserPassword(userId, hashHex, saltHex);
    },
    sendResetEmail: async ({ code }) => {
      emailedCode = code;
    },
  });
  await recovery.requestReset({ email: FIXTURE.email });
  assert.ok(emailedCode);
  const reset = await recovery.confirmReset({
    email: FIXTURE.email,
    code: emailedCode,
    password: 'new-password-ok',
    confirmPassword: 'new-password-ok',
  });
  assert.equal(reset.ok, true);
  assert.equal((await adapter.findUserById(user.id))?.password_hash, 'hash_new-password-ok');

  await adapter.revokeSession(session.id);
  assert.equal(await adapter.getSession(session.id), null);

  return { userId: user.id, desktopSessionId: desktop.id };
}

function iamCompatMinimumSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  display_name TEXT,
  password_hash TEXT,
  salt TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS account_identities (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, provider_subject)
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  provider TEXT,
  provider_subject TEXT,
  display_name TEXT,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  last_active_at INTEGER,
  type TEXT NOT NULL DEFAULT 'browser'
);
CREATE TABLE IF NOT EXISTS auth_event_log (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  provider TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS identity_oauth_states (
  state TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_to TEXT,
  app_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  client_type TEXT,
  native_challenge TEXT,
  native_redirect TEXT
);
CREATE TABLE IF NOT EXISTS identity_native_handoffs (
  handoff_hash TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS company (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  legal_name TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  auth_bg_color TEXT,
  support_email TEXT,
  website_url TEXT,
  tagline TEXT,
  meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_slug ON company(slug);
CREATE TABLE IF NOT EXISTS identity_provider_connections (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  granted_scopes_json TEXT NOT NULL DEFAULT '[]',
  credential_ref TEXT NOT NULL,
  expires_at INTEGER,
  refreshable INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, provider)
);
`;
}

describe('Lane 1 agentsam.identity pack manifest', () => {
  it('resolves pack family + protocol schema-pack contract', () => {
    const { manifest, manifestPath, sqlDir } = resolveIdentitySchemaPack();
    assert.equal(manifest.schema, 'agentsam.schema-pack.v1');
    assert.equal(manifest.id, 'agentsam.identity');
    assert.ok(manifest.components.includes('identity.core'));
    assert.ok(manifest.components.includes('identity.oauth-client'));
    assert.ok(manifest.components.includes('identity.oauth-server'));
    assert.equal(manifest.seed_policy, 'none');
    assert.equal(manifest.compatibility['iam-compat'].owns_portable_schema, false);
    assert.ok(fs.existsSync(manifestPath));
    assert.ok(fs.existsSync(path.join(sqlDir, '001_identity_core.sql')));
    assert.ok(fs.existsSync(path.join(sqlDir, '005_identity_company_native.sql')));
    const protocolSchema = path.resolve(PKG, '../../protocol/database/agentsam.schema-pack.v1.schema.json');
    assert.ok(fs.existsSync(protocolSchema));
    assert.equal(
      fs.existsSync(path.join(PKG, 'schema/agentsam.schema-pack.v1.schema.json')),
      false,
      'generic schema-pack contract must not live under identity package',
    );
  });
});

describe('Lane 1 migration paths', () => {
  it('fresh install reaches schema_version 2', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane1-fresh-'));
    const db = await createLocalSqliteDatabase(path.join(dir, 'identity.sqlite'));
    await applyPortableIdentityMigrations(db);
    const row = await db.prepare(
      `SELECT value FROM identity_schema_meta WHERE key = 'schema_version' LIMIT 1`,
    ).bind().first();
    assert.equal(Number(row.value), IDENTITY_STORE_SCHEMA_VERSION);
    const companies = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='identity_companies'`,
    ).bind().first();
    assert.ok(companies);
    const forbidden = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','auth_users','company','oauth_states')`,
    ).bind().all();
    assert.equal((forbidden.results || []).length, 0);
  });

  it('upgrade: schema_version 1 → 005 → 2 keeps prior rows', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(fs.readFileSync(path.join(SQL_DIR, '001_identity_core.sql'), 'utf8'));
    sqlite.exec(fs.readFileSync(path.join(SQL_DIR, '002_identity_oauth_client.sql'), 'utf8'));
    const before = sqlite.prepare(`SELECT value FROM identity_schema_meta WHERE key='schema_version'`).get();
    assert.equal(Number(before.value), 1);

    const ts = Math.floor(Date.now() / 1000);
    sqlite.prepare(
      `INSERT INTO identity_users (id, email, display_name, password_hash, salt, status, created_at, updated_at)
       VALUES ('au_upgrade', 'upgrade@example.test', 'Upgrade', 'h', 's', 'active', ?, ?)`,
    ).run(ts, ts);
    sqlite.prepare(
      `INSERT INTO identity_oauth_transactions
       (state, provider, code_verifier, return_to, app_id, expires_at, created_at, consumed_at)
       VALUES ('st_upgrade', 'example', 'v', '/x', 'app.example', ?, ?, NULL)`,
    ).run(ts + 600, ts);

    const db = wrapDatabaseSync(sqlite);
    // Apply only 005 (upgrade path).
    const sql005 = fs.readFileSync(path.join(SQL_DIR, '005_identity_company_native.sql'), 'utf8');
    const statements = sql005
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(';')
      .map((s) => s.replace(/--[^\n]*/g, '').trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        sqlite.exec(statement);
      } catch (err) {
        const msg = String(err?.message || err).toLowerCase();
        if (!msg.includes('duplicate column')) throw err;
      }
    }

    const after = sqlite.prepare(`SELECT value FROM identity_schema_meta WHERE key='schema_version'`).get();
    assert.equal(Number(after.value), 2);
    const user = sqlite.prepare(`SELECT email FROM identity_users WHERE id='au_upgrade'`).get();
    assert.equal(user.email, 'upgrade@example.test');
    const tx = sqlite.prepare(`SELECT app_id FROM identity_oauth_transactions WHERE state='st_upgrade'`).get();
    assert.equal(tx.app_id, 'app.example');
    const handoffs = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='identity_native_handoffs'`,
    ).get();
    assert.ok(handoffs);

    const adapter = createSqliteIdentityAdapter(db);
    const session = await adapter.createSession({
      userId: 'au_upgrade',
      email: 'upgrade@example.test',
      type: SESSION_TYPES.DESKTOP,
    });
    assert.equal(session.type, SESSION_TYPES.DESKTOP);
  });
});

describe('Lane 1 shared IdentityStore parity', () => {
  it('A. clean SQLite portable', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane1-sqlite-'));
    const file = path.join(dir, 'identity.sqlite');
    const db = await createLocalSqliteDatabase(file);
    await applyPortableIdentityMigrations(db);
    const adapter = createSqliteIdentityAdapter(db);
    assert.equal(adapter.backend, 'sqlite');
    await runIdentityStoreSuite(adapter, { label: 'sqlite' });

    // Durability: reopen
    const db2 = await createLocalSqliteDatabase(file);
    const adapter2 = createSqliteIdentityAdapter(db2);
    assert.equal((await adapter2.findUserByEmail(FIXTURE.email))?.display_name, FIXTURE.displayName);
    assert.equal((await adapter2.getCompanyBySlug(FIXTURE.companySlug))?.name, FIXTURE.companyName);
  });

  it('B. clean portable D1-shaped (same SQL pack)', async () => {
    const sqlite = new DatabaseSync(':memory:');
    const db = wrapDatabaseSync(sqlite);
    await applyPortableIdentityMigrations(db);
    const adapter = createPortableD1IdentityAdapter(db);
    assert.equal(adapter.backend, 'portable-d1');
    await runIdentityStoreSuite(adapter, { label: 'portable-d1' });
    const forbidden = sqlite.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('accounts','auth_users','company')`,
    ).all();
    assert.equal(forbidden.length, 0);
  });

  it('C. IAM compat on production-shaped fixture (no production rows)', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(iamCompatMinimumSchemaSql());
    const db = wrapDatabaseSync(sqlite);
    const adapter = createIamCompatIdentityAdapter(db);
    assert.equal(adapter.backend, 'iam-compat');
    await runIdentityStoreSuite(adapter, { label: 'iam-compat' });
    const accounts = sqlite.prepare(`SELECT email FROM auth_users WHERE email=?`).get(FIXTURE.email);
    assert.ok(accounts);
    const companies = sqlite.prepare(`SELECT name FROM company WHERE slug=?`).get(FIXTURE.companySlug);
    assert.equal(companies.name, FIXTURE.companyName);
  });

  it('D. createCloudflareD1Adapter remains IAM-compat alias', async () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(iamCompatMinimumSchemaSql());
    const db = wrapDatabaseSync(sqlite);
    const adapter = createCloudflareD1Adapter(db);
    assert.equal(adapter.backend, 'iam-compat');
    assert.equal(createCloudflareD1Adapter, createIamCompatIdentityAdapter);
    await runIdentityStoreSuite(adapter, { label: 'cloudflare-d1-alias' });
  });
});

describe('Lane 1 operator-bleed guard (fixtures)', () => {
  it('parity fixture uses generic user123 identities only', () => {
    assert.equal(FIXTURE.email, 'user123@example.test');
    assert.equal(FIXTURE.companyName, 'Example Company');
    assert.equal(FIXTURE.host, 'example.test');
    assert.equal(FIXTURE.appId, 'app.example.test');
    const fixtureBlob = JSON.stringify(FIXTURE);
    for (const bad of [
      'SamPrimeaux',
      'Sams-iMac',
      'inneranimalmedia-business',
      'inneranimalmedia.com',
    ]) {
      assert.equal(fixtureBlob.includes(bad), false, `operator bleed in fixture: ${bad}`);
    }
  });
});
