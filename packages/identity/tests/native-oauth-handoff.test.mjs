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

// ── Provider-agnostic proof ────────────────────────────────────────────────
// The native handoff is transport only. Every lane Local Studio can expose must
// complete identically: desktop session, deep-link handoff, PKCE exchange, and
// no provider-grant (user_oauth_tokens) writes. IAM is one optional lane, never required.
const EMAIL = 'sam@example.test';
const LANES = [
  {
    name: 'cloudflare (identity sign-in)',
    start: '/api/oauth/cloudflare/start', callback: '/api/oauth/cloudflare/callback', sessionProvider: 'cloudflare',
    env: { CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client', CLOUDFLARE_OAUTH_CLIENT_SECRET: 'cf-secret' },
  },
  {
    name: 'google (BYOK)',
    start: '/api/oauth/google/start', callback: '/api/oauth/google/callback', sessionProvider: 'google',
    env: { GOOGLE_CLIENT_ID: 'g-client', GOOGLE_CLIENT_SECRET: 'g-secret' },
  },
  {
    name: 'github (BYOK)',
    start: '/api/oauth/github/start', callback: '/api/oauth/github/callback', sessionProvider: 'github',
    env: { GITHUB_CLIENT_ID: 'gh-client', GITHUB_CLIENT_SECRET: 'gh-secret' },
  },
  {
    name: 'inneranimalmedia (optional IAM platform lane)',
    start: '/api/oauth/inneranimalmedia/start', callback: '/api/oauth/inneranimalmedia/callback', sessionProvider: 'iam',
    env: { IAM_CLIENT_ID: 'iam-client', IAM_CLIENT_SECRET: 'iam-secret', IAM_OAUTH_ISSUER: 'https://iam.test' },
  },
];

async function withAllProviderStubs(fn) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const u = String(input?.url || input);
    if (u.includes('/oauth2/token')) return Response.json({ access_token: 'cf_access' });
    if (u.includes('/oauth2/userinfo')) return Response.json({ sub: 'cf-user-1' });
    if (u.includes('/client/v4/user')) return Response.json({ result: { email: EMAIL, first_name: 'Sam' } });
    if (u.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'g_access' });
    if (u.includes('openidconnect.googleapis.com')) return Response.json({ sub: 'g-1', email: EMAIL, name: 'Sam' });
    if (u.includes('github.com/login/oauth')) return Response.json({ access_token: 'gh_access' });
    if (u.includes('api.github.com/user/emails')) return Response.json([{ email: EMAIL, primary: true, verified: true }]);
    if (u.includes('api.github.com/user')) return Response.json({ id: 42, login: 'sam', name: 'Sam' });
    if (u.startsWith('https://iam.test') && /token/.test(u)) return Response.json({ ok: true, access_token: 'iam_access' });
    if (u.startsWith('https://iam.test')) return Response.json({ sub: 'iam-1', email: EMAIL, email_verified: true, name: 'Sam' });
    throw new Error(`unexpected_fetch:${u}`);
  };
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}

for (const lane of LANES) {
  test(`[${lane.name}] native login: desktop session → handoff → PKCE exchange, no grant writes`, async () => {
    const db = createTestD1();
    const env = { DB: db, ...lane.env };
    const verifier = pkceVerifier();

    const startUrl = new URL(`https://studio.test${lane.start}`);
    startUrl.searchParams.set('client', 'native');
    startUrl.searchParams.set('native_challenge', await pkceChallenge(verifier));
    startUrl.searchParams.set('native_redirect', REDIRECT);
    const start = await handleIdentityWorkerRequest(new Request(startUrl), env, options);
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    assert.equal(db.sqlite.prepare('SELECT client_type FROM identity_oauth_states WHERE state = ?').get(state).client_type, 'desktop');

    const cb = await withAllProviderStubs(() => handleIdentityWorkerRequest(
      new Request(`https://studio.test${lane.callback}?code=abc&state=${state}`), env, options,
    ));
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get('set-cookie'), null, 'no browser cookie on native login');
    const location = new URL(cb.headers.get('location'));
    assert.equal(`${location.protocol}//${location.host}${location.pathname}`, REDIRECT);
    const handoff = location.searchParams.get('handoff');
    assert.ok(handoff);

    const session = db.sqlite.prepare('SELECT * FROM auth_sessions').get();
    assert.equal(session.type, 'desktop');
    assert.equal(session.provider, lane.sessionProvider);
    assert.ok(!location.toString().includes(session.id));
    assert.equal(db.log.some((s) => /user_oauth_tokens/i.test(s)), false, 'sign-in never writes provider grants');

    const exchange = () => handleIdentityWorkerRequest(new Request('https://studio.test/api/oauth/native/exchange', {
      method: 'POST', body: JSON.stringify({ handoff, code_verifier: verifier }),
    }), env, options);
    const ok = await exchange();
    assert.equal(ok.status, 200);
    const payload = await ok.json();
    assert.equal(payload.session_id, session.id);
    assert.equal(payload.user.email, EMAIL);
    assert.ok(payload.expires_at > 0);
    assert.equal((await exchange()).status, 400, 'single-use');
  });
}

test('IAM is optional: Cloudflare native sign-in works with no IAM config, and the IAM lane reports not-configured', async () => {
  const db = createTestD1();
  const env = { DB: db, ...LANES[0].env }; // no IAM_* at all
  const iamStart = await handleIdentityWorkerRequest(
    new Request('https://studio.test/api/oauth/inneranimalmedia/start'), env, options,
  );
  assert.equal(iamStart.status, 503);
  assert.equal((await iamStart.json()).error, 'inneranimalmedia_oauth_not_configured');

  const cfStart = await nativeStart(env, { challenge: await pkceChallenge(pkceVerifier()) });
  assert.equal(cfStart.status, 302);
});
