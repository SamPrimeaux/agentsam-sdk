import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
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

async function boot() {
  const native = new DatabaseSync(':memory:');
  const db = d1Shaped(native);
  await applySqliteIdentityMigrations(db);
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
  return { native, call };
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
});
