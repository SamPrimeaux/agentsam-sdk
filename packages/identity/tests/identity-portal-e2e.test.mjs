import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { PORTABLE_IDENTITY_MIGRATIONS_DIR, applyPortableIdentityMigrations } from '../migrations/apply-portable.js';
import { applySqliteIdentityMigrations, createSqliteIdentityAdapter } from '../src/adapters/sqlite/index.js';
import { createIdentityService } from '../src/server/identity-service.js';
import { handleIdentityWorkerRequest } from '../src/server/worker-router.js';
import { IDENTITY_ROUTE_IDS } from '../src/contracts/route-ids.js';
import { createRouteRegistry, defineRouteProjection } from '../src/contracts/route-projection.js';

function d1Shaped(native) {
  return {
    prepare(sql) {
      const st = native.prepare(sql);
      const bound = (v = []) => ({
        async run() { return st.run(...v); },
        async first() { return st.get(...v) ?? null; },
        async all() { return { results: st.all(...v) }; },
      });
      return { bind: (...v) => bound(v), ...bound() };
    },
    exec: (sql) => native.exec(sql),
  };
}

async function boot({ beforeStore } = {}) {
  const native = new DatabaseSync(':memory:');
  const db = d1Shaped(native);
  await applySqliteIdentityMigrations(db);
  if (beforeStore) beforeStore(native);
  const adapter = createSqliteIdentityAdapter(db);
  const app = { id: 'identity-e2e-app' };
  const routeRegistry = createRouteRegistry([defineRouteProjection({
    appId: app.id,
    routes: {
      [IDENTITY_ROUTE_IDS.LOGIN]: '/auth/login',
      [IDENTITY_ROUTE_IDS.RECOVERY]: '/auth/reset',
      [IDENTITY_ROUTE_IDS.APP_AUTHENTICATED]: '/agentsam',
      [IDENTITY_ROUTE_IDS.OAUTH_CALLBACK]: '/api/oauth/:provider/callback',
    },
  })]);
  const identity = createIdentityService({ adapter, app, routeRegistry });
  const call = async (method, path, { body, cookie } = {}) => {
    const res = await handleIdentityWorkerRequest(
      new Request(`http://local.test${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
      { DB: db },
      { adapter, identity, app, routeRegistry },
    );
    return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0] || null, json: await res.json().catch(() => null) };
  };
  return { native, call, adapter };
}

const CREDS = { email: 'e2e@example.test', password: 'correct-horse-9' };

describe('identity portal end to end on clean local SQLite', () => {
  it('signup, login, me, logout leave the expected rows', async () => {
    const { native, call } = await boot();

    assert.equal((await call('POST', '/api/auth/signup', { body: { ...CREDS, name: 'E2E' } })).status, 200);
    const login = await call('POST', '/api/auth/login', { body: CREDS });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
    assert.equal((await call('POST', '/api/auth/login', { body: { ...CREDS, password: 'wrong' } })).status, 401);

    assert.equal((await call('GET', '/api/auth/me', { cookie: login.cookie })).status, 200);
    assert.equal((await call('POST', '/api/auth/logout', { cookie: login.cookie })).status, 200);
    assert.equal((await call('GET', '/api/auth/me', { cookie: login.cookie })).status, 401);

    const user = native.prepare('SELECT id FROM identity_users WHERE email = ?').get(CREDS.email);
    assert.ok(user?.id);

    const sessions = native.prepare('SELECT * FROM identity_sessions ORDER BY created_at, rowid').all();
    assert.equal(sessions.length, 2, 'signup session + login session');
    const [signupSession, loginSession] = sessions;
    assert.equal(signupSession.revoked_at, null);
    assert.ok(loginSession.revoked_at);
    assert.equal(loginSession.revoke_reason, 'logout');
    for (const s of sessions) {
      assert.equal(typeof s.created_at, 'number');
      assert.equal(typeof s.last_active_at, 'number');
      assert.equal(typeof s.expires_at, 'number');
    }

    const events = native.prepare('SELECT event_type, status, user_id FROM identity_auth_events ORDER BY created_at, rowid').all();
    assert.deepEqual(
      events.map((e) => `${e.event_type}:${e.status}`),
      ['signup:ok', 'login:ok', 'login:failed', 'logout:ok'],
    );
    assert.equal(events[0].user_id, user.id);
    assert.equal(events[1].user_id, user.id);
    assert.equal(events[3].user_id, user.id);
  });

  it('duplicate signup is rejected and recorded as a failed signup', async () => {
    const { native, call } = await boot();
    await call('POST', '/api/auth/signup', { body: CREDS });
    const dup = await call('POST', '/api/auth/signup', { body: CREDS });
    assert.equal(dup.status, 400);
    const failed = native.prepare("SELECT status FROM identity_auth_events WHERE event_type = 'signup' ORDER BY rowid").all();
    assert.deepEqual(failed.map((e) => e.status), ['ok', 'failed']);
  });

  it('signup mirrors into accounts and login stamps accounts.last_active_at', async () => {
    const { native, call } = await boot();
    await call('POST', '/api/auth/signup', { body: { ...CREDS, name: 'E2E' } });
    const user = native.prepare('SELECT id, created_at FROM identity_users WHERE email = ?').get(CREDS.email);
    const account = native.prepare('SELECT * FROM accounts WHERE id = ?').get(user.id);
    assert.ok(account, 'accounts row shares the identity_users id');
    assert.equal(account.email, CREDS.email);
    assert.equal(account.display_name, 'E2E');
    assert.equal(account.type, 'human');
    assert.equal(account.status, 'active');
    assert.equal(account.plan, 'free');
    assert.equal(account.password_hash, null, 'credentials stay in identity_users');
    assert.equal(typeof account.last_active_at, 'number', 'signup session stamps last_active_at');
    native.prepare('UPDATE accounts SET last_active_at = 1').run();
    await call('POST', '/api/auth/login', { body: CREDS });
    const after = native.prepare('SELECT last_active_at FROM accounts WHERE id = ?').get(user.id);
    assert.ok(after.last_active_at > 1, 'login stamps accounts.last_active_at');
  });

  it('re-applying the pack backfills accounts for a database created before 008', async () => {
    const native = new DatabaseSync(':memory:');
    for (const file of ['001_identity_core.sql', '002_identity_oauth_client.sql', '005_identity_company_native.sql',
      '006_identity_account_security.sql', '007_identity_session_revoke_reason.sql']) {
      native.exec(fs.readFileSync(path.join(PORTABLE_IDENTITY_MIGRATIONS_DIR, file), 'utf8'));
    }
    native.prepare(`INSERT INTO identity_users (id, email, display_name, status, created_at, updated_at)
      VALUES ('au_old1', 'old@example.test', NULL, 'active', 100, 100)`).run();
    native.prepare(`INSERT INTO identity_sessions (id, user_id, expires_at, created_at, last_active_at)
      VALUES ('s_old1', 'au_old1', 9999999999, 100, 250)`).run();
    assert.equal(native.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='accounts'").get().n, 0);

    await applyPortableIdentityMigrations(d1Shaped(native));
    await applyPortableIdentityMigrations(d1Shaped(native)); // idempotent

    const rows = native.prepare('SELECT id, email, display_name, last_active_at FROM accounts').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'au_old1');
    assert.equal(rows[0].display_name, 'old@example.test', 'falls back to email when no display name');
    assert.equal(rows[0].last_active_at, 250, 'seeded from the newest session');
  });

  it('a database without accounts still signs up and logs in', async () => {
    const { native, call } = await boot({ beforeStore: (n) => n.exec('DROP TABLE accounts') });
    assert.equal((await call('POST', '/api/auth/signup', { body: CREDS })).status, 200);
    assert.equal((await call('POST', '/api/auth/login', { body: CREDS })).status, 200);
    assert.equal(native.prepare('SELECT count(*) AS n FROM identity_sessions').get().n, 2);
  });

  it('a profile display name change keeps accounts and identity_users in step', async () => {
    const { native, call, adapter } = await boot();
    await call('POST', '/api/auth/signup', { body: { ...CREDS, name: 'Before' } });
    const { id } = native.prepare('SELECT id FROM identity_users WHERE email = ?').get(CREDS.email);
    await adapter.updateAccountProfile(id, { displayName: 'After' });
    assert.equal(native.prepare('SELECT display_name AS n FROM identity_users WHERE id = ?').get(id).n, 'After');
    assert.equal(native.prepare('SELECT display_name AS n FROM accounts WHERE id = ?').get(id).n, 'After');
  });
});
