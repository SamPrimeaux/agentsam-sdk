import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { handleIdentityWorkerRequest } from '../src/server/worker-router.js';
import {
  isAllowedNativeRedirect,
  parseNativeStart,
} from '../src/oauth/native-handoff.js';
import { pkceChallenge, pkceVerifier } from '../src/oauth/pkce.js';
import { IDENTITY_ROUTE_IDS } from '../src/contracts/route-ids.js';
import { createRouteRegistry, defineRouteProjection } from '../src/contracts/route-projection.js';

const REDIRECT = 'agentsamstudio://auth/callback';

/** D1-shaped shim over node:sqlite so the real adapter + router run unmodified. */
function createTestD1() {
  const sqlite = new DatabaseSync(':memory:');
  const root = new URL('../../../migrations/d1/', import.meta.url);
  for (const f of ['0013_identity_oauth_states.sql', '0014_auth_event_log.sql', '0015_identity_oauth_state_app_id.sql', '0017_identity_native_oauth.sql']) {
    sqlite.exec(readFileSync(new URL(f, root), 'utf8'));
  }
  // Live-shaped subset of the account/session tables the adapter touches.
  sqlite.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, display_name TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT UNIQUE, display_name TEXT, password_hash TEXT, salt TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE account_identities (id TEXT PRIMARY KEY, account_id TEXT, provider TEXT, provider_subject TEXT, email TEXT, created_at INTEGER, updated_at INTEGER, UNIQUE(provider, provider_subject));
    CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT, email TEXT, provider TEXT, provider_subject TEXT, display_name TEXT,
      expires_at TEXT, created_at TEXT, last_active_at INTEGER, revoked_at TEXT, type TEXT NOT NULL DEFAULT 'browser');
  `);
  const log = [];
  return {
    sqlite,
    log,
    prepare(sql) {
      log.push(sql);
      return {
        bind: (...args) => ({
          first: async () => sqlite.prepare(sql).get(...args) ?? null,
          run: async () => { sqlite.prepare(sql).run(...args); return { success: true }; },
          all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
        }),
      };
    },
  };
}

const app = { id: 'local-studio' };
const routeRegistry = createRouteRegistry([
  defineRouteProjection({
    appId: app.id,
    routes: {
      [IDENTITY_ROUTE_IDS.LOGIN]: '/auth/login',
      [IDENTITY_ROUTE_IDS.RECOVERY]: '/auth/reset',
      [IDENTITY_ROUTE_IDS.APP_AUTHENTICATED]: '/agentsam',
      [IDENTITY_ROUTE_IDS.OAUTH_CALLBACK]: '/api/oauth/:provider/callback',
    },
  }),
]);
const options = { app, routeRegistry };
const cfEnv = (DB) => ({ DB, CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client', CLOUDFLARE_OAUTH_CLIENT_SECRET: 'cf-secret' });

/** Stub Cloudflare token + userinfo + /v4/user so the real callback runs offline. */
async function withCloudflareStub(fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input?.url || input);
    if (u.includes('/oauth2/token')) return Response.json({ access_token: 'cf_access', refresh_token: 'cf_refresh' });
    if (u.includes('/oauth2/userinfo')) return Response.json({ sub: 'cf-user-1' });
    if (u.includes('/client/v4/user')) return Response.json({ result: { email: 'sam@example.test', first_name: 'Sam' } });
    throw new Error(`unexpected_fetch:${u}`);
  };
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}

async function nativeStart(env, { challenge, redirect = REDIRECT }) {
  const url = new URL('https://studio.test/api/oauth/cloudflare/start');
  url.searchParams.set('client', 'native');
  if (challenge) url.searchParams.set('native_challenge', challenge);
  url.searchParams.set('native_redirect', redirect);
  return handleIdentityWorkerRequest(new Request(url), env, options);
}

test('native redirect allowlist: deep link + loopback only', () => {
  assert.equal(isAllowedNativeRedirect('agentsamstudio://auth/callback'), true);
  assert.equal(isAllowedNativeRedirect('http://127.0.0.1:53682/cb'), true);
  assert.equal(isAllowedNativeRedirect('http://localhost:1/cb'), true);
  assert.equal(isAllowedNativeRedirect('https://evil.example/cb'), false);
  assert.equal(isAllowedNativeRedirect('http://evil.example/cb'), false);
  assert.equal(isAllowedNativeRedirect('javascript:alert(1)'), false);
  assert.equal(isAllowedNativeRedirect('otherscheme://x'), false);
  assert.equal(isAllowedNativeRedirect('otherscheme://x', { IDENTITY_NATIVE_REDIRECT_SCHEMES: 'otherscheme' }), true);
});

test('parseNativeStart: browser requests are untouched; bad native params are rejected', async () => {
  const good = await pkceChallenge(pkceVerifier());
  assert.deepEqual(parseNativeStart(new URL('https://x.test/start')), { native: false });
  assert.equal(parseNativeStart(new URL(`https://x.test/start?client=native&native_challenge=short&native_redirect=${REDIRECT}`)).error, 'native_challenge_invalid');
  assert.equal(parseNativeStart(new URL(`https://x.test/start?client=native&native_challenge=${good}&native_redirect=https://evil.example`)).error, 'native_redirect_not_allowed');
  assert.equal(parseNativeStart(new URL(`https://x.test/start?client=native&native_challenge=${good}&native_redirect=${REDIRECT}`)).clientType, 'desktop');
});

test('native start rejects a bad redirect before any transaction is stored', async () => {
  const db = createTestD1();
  const res = await nativeStart(cfEnv(db), { challenge: await pkceChallenge(pkceVerifier()), redirect: 'https://evil.example/cb' });
  assert.equal(res.status, 400);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM identity_oauth_states').get().c, 0);
});

test('full native Cloudflare login: desktop session, deep-link handoff, single-use PKCE exchange', async () => {
  const db = createTestD1();
  const env = cfEnv(db);
  const verifier = pkceVerifier();

  const start = await nativeStart(env, { challenge: await pkceChallenge(verifier) });
  assert.equal(start.status, 302);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const txn = db.sqlite.prepare('SELECT * FROM identity_oauth_states WHERE state = ?').get(state);
  assert.equal(txn.client_type, 'desktop');
  assert.equal(txn.native_redirect, REDIRECT);

  const cb = await withCloudflareStub(() => handleIdentityWorkerRequest(
    new Request(`https://studio.test/api/oauth/cloudflare/callback?code=abc&state=${state}`), env, options,
  ));
  assert.equal(cb.status, 302);
  assert.equal(cb.headers.get('set-cookie'), null, 'native login must not set a browser cookie');
  const location = new URL(cb.headers.get('location'));
  assert.equal(`${location.protocol}//${location.host}${location.pathname}`, REDIRECT);
  const handoff = location.searchParams.get('handoff');
  assert.ok(handoff);

  const session = db.sqlite.prepare('SELECT * FROM auth_sessions').get();
  assert.equal(session.type, 'desktop');
  assert.equal(session.provider, 'cloudflare');
  assert.ok(!location.toString().includes(session.id), 'session id must never appear in the deep link');
  // Identity only: a Cloudflare *login* must not create resource-grant rows.
  assert.equal(db.log.some((s) => /user_oauth_tokens/i.test(s)), false);

  const exchange = (body) => handleIdentityWorkerRequest(new Request('https://studio.test/api/oauth/native/exchange', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }), env, options);

  const ok = await exchange({ handoff, code_verifier: verifier });
  assert.equal(ok.status, 200);
  const payload = await ok.json();
  assert.equal(payload.session_id, session.id);
  assert.equal(payload.user.email, 'sam@example.test');

  const replay = await exchange({ handoff, code_verifier: verifier });
  assert.equal(replay.status, 400, 'handoff is single-use');
});

test('wrong PKCE verifier burns the handoff and revokes the desktop session', async () => {
  const db = createTestD1();
  const env = cfEnv(db);
  const verifier = pkceVerifier();
  const start = await nativeStart(env, { challenge: await pkceChallenge(verifier) });
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  const cb = await withCloudflareStub(() => handleIdentityWorkerRequest(
    new Request(`https://studio.test/api/oauth/cloudflare/callback?code=abc&state=${state}`), env, options,
  ));
  const handoff = new URL(cb.headers.get('location')).searchParams.get('handoff');

  const exchange = (v) => handleIdentityWorkerRequest(new Request('https://studio.test/api/oauth/native/exchange', {
    method: 'POST', body: JSON.stringify({ handoff, code_verifier: v }),
  }), env, options);
  assert.equal((await exchange(pkceVerifier())).status, 400);
  assert.equal((await exchange(verifier)).status, 400, 'code already burned even for the right verifier');
  assert.ok(db.sqlite.prepare('SELECT revoked_at FROM auth_sessions').get().revoked_at, 'session revoked');
});

test('browser Cloudflare login is unchanged: browser session, cookie, globe redirect, no native columns written', async () => {
  const db = createTestD1();
  const env = cfEnv(db);
  const start = await handleIdentityWorkerRequest(new Request('https://studio.test/api/oauth/cloudflare/start'), env, options);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  assert.equal(db.log.filter((s) => /INSERT INTO identity_oauth_states/.test(s)).every((s) => !/client_type/.test(s)), true);

  const cb = await withCloudflareStub(() => handleIdentityWorkerRequest(
    new Request(`https://studio.test/api/oauth/cloudflare/callback?code=abc&state=${state}`), env, options,
  ));
  assert.equal(cb.status, 302);
  assert.match(cb.headers.get('set-cookie') || '', /HttpOnly/);
  assert.match(cb.headers.get('location'), /globe_exit=1/);
  assert.equal(db.sqlite.prepare('SELECT type FROM auth_sessions').get().type, 'browser');
  assert.equal(db.log.filter((s) => /INSERT INTO auth_sessions/.test(s)).every((s) => !/\btype\b/.test(s)), true);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) c FROM identity_native_handoffs').get().c, 0);
});
