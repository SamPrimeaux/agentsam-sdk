/**
 * CLI Google Cloud login via Studio Web OAuth client (has GOOGLE_CLIENT_SECRET).
 *
 * Why: Google Auth Platform "Desktop" clients sometimes reject public PKCE token
 * exchange with "client_secret is missing" even though Console shows Type=Desktop
 * and issues no secret. Web client + Worker secret is the reliable stock path;
 * Desktop PKCE remains available via --desktop once Google classifies the client correctly.
 *
 * Web Console must allow redirect:
 *   https://agentsam.inneranimalmedia.com/api/oauth/google/cli-cloud/callback
 */

import { createHash, randomBytes } from 'node:crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const CLOUD_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ');

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function isLoopbackUri(uri) {
  try {
    const u = new URL(String(uri || ''));
    if (u.protocol !== 'http:') return false;
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '[::1]';
  } catch {
    return false;
  }
}

async function ensureTables(db) {
  if (!db?.prepare) throw new Error('db_unavailable');
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS agentsam_cli_oauth_pending (
      state TEXT PRIMARY KEY,
      code_verifier TEXT NOT NULL,
      loopback_uri TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS agentsam_cli_oauth_pickups (
      pickup_id TEXT PRIMARY KEY,
      cli_state TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT,
      scope TEXT,
      expires_at INTEGER,
      email TEXT,
      created_at INTEGER NOT NULL,
      consumed_at INTEGER
    )
  `).run();
}

function htmlPage(title, body) {
  return new Response(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem"><h1>${title}</h1><p>${body}</p></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

/**
 * GET /api/oauth/google/cli-cloud/start?loopback=&state=
 */
export async function handleGoogleCliCloudStart(request, env) {
  if (request.method !== 'GET') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const url = new URL(request.url);
  const loopback = clean(url.searchParams.get('loopback'));
  const cliState = clean(url.searchParams.get('state'));
  const clientId = clean(env.GOOGLE_CLIENT_ID);
  const clientSecret = clean(env.GOOGLE_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    return json({
      ok: false,
      error: 'google_web_client_not_configured',
      detail: 'Worker needs GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET for CLI cloud login broker.',
    }, 503);
  }
  if (!cliState || !isLoopbackUri(loopback)) {
    return json({ ok: false, error: 'loopback_and_state_required' }, 400);
  }

  await ensureTables(env.DB);
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const oauthState = `cli_${b64url(randomBytes(18))}`;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO agentsam_cli_oauth_pending (state, code_verifier, loopback_uri, created_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(oauthState, verifier, JSON.stringify({ loopback, cliState }), now).run();

  // Drop stale pending (>15m)
  await env.DB.prepare(`DELETE FROM agentsam_cli_oauth_pending WHERE created_at < ?`)
    .bind(now - 900).run();

  const redirectUri = `${url.origin}/api/oauth/google/cli-cloud/callback`;
  const auth = new URL(GOOGLE_AUTH_URL);
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('redirect_uri', redirectUri);
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set('scope', CLOUD_SCOPES);
  auth.searchParams.set('state', oauthState);
  auth.searchParams.set('code_challenge', challenge);
  auth.searchParams.set('code_challenge_method', 'S256');
  auth.searchParams.set('access_type', 'offline');
  auth.searchParams.set('prompt', 'consent');
  auth.searchParams.set('include_granted_scopes', 'true');

  return Response.redirect(auth.toString(), 302);
}

/**
 * GET /api/oauth/google/cli-cloud/callback
 */
export async function handleGoogleCliCloudCallback(request, env) {
  const url = new URL(request.url);
  const code = clean(url.searchParams.get('code'));
  const oauthState = clean(url.searchParams.get('state'));
  const oauthError = clean(url.searchParams.get('error'));
  if (oauthError || !code || !oauthState) {
    return htmlPage('Agent Sam', 'Google authorization failed. Return to the terminal and retry.');
  }

  await ensureTables(env.DB);
  const pending = await env.DB.prepare(
    `SELECT code_verifier, loopback_uri, created_at FROM agentsam_cli_oauth_pending WHERE state = ? LIMIT 1`,
  ).bind(oauthState).first();
  await env.DB.prepare(`DELETE FROM agentsam_cli_oauth_pending WHERE state = ?`).bind(oauthState).run();

  if (!pending) {
    return htmlPage('Agent Sam', 'OAuth state expired. Return to the terminal and retry.');
  }
  const now = Math.floor(Date.now() / 1000);
  if (Number(pending.created_at) < now - 900) {
    return htmlPage('Agent Sam', 'OAuth state expired. Return to the terminal and retry.');
  }

  let meta = {};
  try { meta = JSON.parse(pending.loopback_uri); } catch { meta = {}; }
  const loopback = clean(meta.loopback);
  const cliState = clean(meta.cliState);
  if (!isLoopbackUri(loopback) || !cliState) {
    return htmlPage('Agent Sam', 'Invalid CLI loopback metadata. Return to the terminal and retry.');
  }

  const redirectUri = `${url.origin}/api/oauth/google/cli-cloud/callback`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: pending.code_verifier,
    client_id: clean(env.GOOGLE_CLIENT_ID),
    client_secret: clean(env.GOOGLE_CLIENT_SECRET),
    redirect_uri: redirectUri,
  });
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const token = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !token.access_token) {
    const detail = token.error_description || token.error || `http_${tokenRes.status}`;
    return htmlPage('Agent Sam', `Token exchange failed (${detail}). Return to the terminal.`);
  }

  let email = null;
  try {
    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await profileRes.json();
      email = clean(profile?.email) || null;
    }
  } catch { /* ignore */ }

  const pickupId = `pk_${b64url(randomBytes(24))}`;
  const expiresAt = token.expires_in
    ? now + Number(token.expires_in)
    : null;
  await env.DB.prepare(`
    INSERT INTO agentsam_cli_oauth_pickups (
      pickup_id, cli_state, access_token, refresh_token, token_type, scope,
      expires_at, email, created_at, consumed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    pickupId,
    cliState,
    token.access_token,
    token.refresh_token || null,
    token.token_type || 'Bearer',
    token.scope || CLOUD_SCOPES,
    expiresAt,
    email,
    now,
  ).run();

  const dest = new URL(loopback);
  dest.searchParams.set('state', cliState);
  dest.searchParams.set('pickup', pickupId);
  return Response.redirect(dest.toString(), 302);
}

/**
 * POST /api/oauth/google/cli-cloud/pickup
 * Body: { pickup, state }
 */
export async function handleGoogleCliCloudPickup(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  let payload = {};
  try { payload = await request.json(); } catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  const pickupId = clean(payload.pickup || payload.pickup_id);
  const cliState = clean(payload.state);
  if (!pickupId || !cliState) return json({ ok: false, error: 'pickup_and_state_required' }, 400);

  await ensureTables(env.DB);
  const row = await env.DB.prepare(`
    SELECT pickup_id, cli_state, access_token, refresh_token, token_type, scope,
           expires_at, email, consumed_at
    FROM agentsam_cli_oauth_pickups WHERE pickup_id = ? LIMIT 1
  `).bind(pickupId).first();

  if (!row || row.cli_state !== cliState) {
    return json({ ok: false, error: 'pickup_not_found' }, 404);
  }
  if (row.consumed_at) {
    return json({ ok: false, error: 'pickup_already_consumed' }, 409);
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agentsam_cli_oauth_pickups SET consumed_at = ?, access_token = '', refresh_token = NULL WHERE pickup_id = ?`,
  ).bind(now, pickupId).run();

  return json({
    ok: true,
    access_token: row.access_token,
    refresh_token: row.refresh_token || null,
    token_type: row.token_type || 'Bearer',
    scope: row.scope || null,
    expires_at: row.expires_at || null,
    email: row.email || null,
    exchange_via: 'studio_web_broker',
  });
}

export function isGoogleCliCloudPath(pathname) {
  return pathname === '/api/oauth/google/cli-cloud/start'
    || pathname === '/api/oauth/google/cli-cloud/callback'
    || pathname === '/api/oauth/google/cli-cloud/pickup';
}

export async function handleGoogleCliCloudRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/oauth/google/cli-cloud/start') {
    return handleGoogleCliCloudStart(request, env);
  }
  if (url.pathname === '/api/oauth/google/cli-cloud/callback') {
    return handleGoogleCliCloudCallback(request, env);
  }
  if (url.pathname === '/api/oauth/google/cli-cloud/pickup') {
    return handleGoogleCliCloudPickup(request, env);
  }
  return json({ ok: false, error: 'not_found' }, 404);
}
