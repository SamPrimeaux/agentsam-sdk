import {
  CLOUDFLARE_CALLBACK_PATH,
  CLOUDFLARE_OAUTH_TOKEN_URL,
  CLOUDFLARE_OAUTH_REVOKE_URL,
  buildAuthorizeUrl,
  cloudflareConnectionSafeStatus,
  resolveCloudflareOAuthClient,
  requestedCloudflareScopes,
  assertConnectionOwner,
} from './index.js';
import { resolveAuthenticatedOwner } from './owner.js';
import { sealToken, vaultConfigured } from './vault.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { location } });
}

export function isCloudflareConnectionPath(pathname) {
  return pathname === '/api/connections/cloudflare'
    || pathname === '/api/connections/cloudflare/start'
    || pathname === CLOUDFLARE_CALLBACK_PATH
    || pathname === '/api/connections/cloudflare/disconnect';
}

async function ensureTables(env) {
  if (!env?.DB?.prepare) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agentsam_cloudflare_connections (
    connection_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    cloudflare_account_id TEXT,
    scopes TEXT,
    status TEXT,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    expires_at INTEGER
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS agentsam_cloudflare_oauth_state (
    state TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    created_at INTEGER
  )`).run();
}

export async function handleCloudflareConnectionRequest(request, env) {
  const url = new URL(request.url);
  const client = resolveCloudflareOAuthClient(env);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  let body = {};
  if (request.method === 'POST') {
    body = await request.json().catch(() => ({}));
  }

  const isCallback = url.pathname === CLOUDFLARE_CALLBACK_PATH && request.method === 'GET';
  let ownerId = '';
  try {
    ownerId = await resolveAuthenticatedOwner(request, env, url, body);
  } catch (err) {
    if (!isCallback || err.code === 'untrusted_owner_hint') {
      const code = err.code || 'unauthenticated';
      return json({ ok: false, error: code }, code === 'untrusted_owner_hint' ? 400 : 401);
    }
  }

  if (!client.productionReady) {
    if (url.pathname === '/api/connections/cloudflare' && request.method === 'GET') {
      return json({
        ok: true,
        ...cloudflareConnectionSafeStatus(env, null, ownerId),
      });
    }
    if (url.pathname === '/api/connections/cloudflare/start') {
      return json({
        ok: false,
        error: 'not_configured',
        message: 'real Cloudflare OAuth client still required',
        fixture: client.fixture,
      }, 503);
    }
  }

  await ensureTables(env);

  if (url.pathname === '/api/connections/cloudflare' && request.method === 'GET') {
    let connection = null;
    if (env.DB) {
      const row = await env.DB.prepare(
        `SELECT connection_id, owner_id, cloudflare_account_id, scopes, status, created_at, updated_at, expires_at
         FROM agentsam_cloudflare_connections WHERE owner_id = ? LIMIT 1`,
      ).bind(ownerId).first();
      if (row) {
        connection = {
          connectionId: row.connection_id,
          ownerId: row.owner_id,
          cloudflareAccountId: row.cloudflare_account_id,
          scopes: row.scopes ? String(row.scopes).split(' ') : [],
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          expiresAt: row.expires_at,
        };
      }
    }
    return json({ ok: true, ...cloudflareConnectionSafeStatus(env, connection, ownerId) });
  }

  if (url.pathname === '/api/connections/cloudflare/start' && request.method === 'GET') {
    const state = crypto.randomUUID().replace(/-/g, '');
    const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = btoa(String.fromCharCode(...verifierBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO agentsam_cloudflare_oauth_state (state, owner_id, code_verifier, created_at) VALUES (?, ?, ?, unixepoch())`,
      ).bind(state, ownerId, verifier).run();
    } else if (env.oauthState instanceof Map) {
      env.oauthState.set(state, { ownerId, verifier });
    }
    const redirectUri = `${url.origin}${CLOUDFLARE_CALLBACK_PATH}`;
    const authorize = buildAuthorizeUrl({
      clientId: String(env.CLOUDFLARE_OAUTH_CLIENT_ID),
      redirectUri,
      state,
      codeChallenge: challenge,
    });
    return json({ ok: true, authorize_url: authorize, callback: CLOUDFLARE_CALLBACK_PATH });
  }

  if (url.pathname === CLOUDFLARE_CALLBACK_PATH && request.method === 'GET') {
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    let stored = null;
    if (env.DB) {
      stored = await env.DB.prepare(
        `SELECT owner_id, code_verifier FROM agentsam_cloudflare_oauth_state WHERE state = ?`,
      ).bind(state).first();
    } else if (env.oauthState instanceof Map) {
      stored = env.oauthState.get(state);
      if (stored) stored = { owner_id: stored.ownerId, code_verifier: stored.verifier };
    }
    if (!stored) {
      return json({ ok: false, error: 'cloudflare_connection_forbidden' }, 403);
    }
    if (!ownerId) ownerId = stored.owner_id;
    if (stored.owner_id !== ownerId) {
      return json({ ok: false, error: 'cloudflare_connection_forbidden' }, 403);
    }
    // client_secret is only included when configured (PKCE-only "None"
    // clients on the Cloudflare dashboard have no secret at all).
    const tokenParams = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}${CLOUDFLARE_CALLBACK_PATH}`,
      client_id: String(env.CLOUDFLARE_OAUTH_CLIENT_ID),
      code_verifier: stored.code_verifier,
    };
    if (env.CLOUDFLARE_OAUTH_CLIENT_SECRET) {
      tokenParams.client_secret = String(env.CLOUDFLARE_OAUTH_CLIENT_SECRET);
    }
    const tokenRes = await fetch(CLOUDFLARE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams),
    });
    if (!tokenRes.ok) {
      return json({ ok: false, error: 'token_exchange_failed' }, 502);
    }
    const tokens = await tokenRes.json();
    const connectionId = `cfconn_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    if (tokens.access_token && !vaultConfigured(env)) {
      return json({ ok: false, error: 'vault_unavailable' }, 503);
    }
    const aad = `cloudflare-connection:${ownerId}`;
    let accessEnc = null;
    let refreshEnc = null;
    try {
      accessEnc = await sealToken(env, tokens.access_token, aad);
      refreshEnc = await sealToken(env, tokens.refresh_token, aad);
    } catch (err) {
      return json({ ok: false, error: err.code || 'vault_unavailable' }, 503);
    }
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO agentsam_cloudflare_connections (
           connection_id, owner_id, cloudflare_account_id, scopes, status,
           access_token_encrypted, refresh_token_encrypted, created_at, updated_at, expires_at
         ) VALUES (?, ?, ?, ?, 'connected', ?, ?, unixepoch(), unixepoch(), ?)`,
      ).bind(
        connectionId,
        ownerId,
        tokens.account_id || null,
        (tokens.scope || requestedCloudflareScopes().join(' ')),
        accessEnc,
        refreshEnc,
        tokens.expires_in ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in) : null,
      ).run();
    }
    return redirect(`/agentsam?connection=cloudflare`);
  }

  if (url.pathname === '/api/connections/cloudflare/disconnect' && request.method === 'POST') {
    if (env.DB) {
      const row = await env.DB.prepare(
        `SELECT connection_id, owner_id FROM agentsam_cloudflare_connections WHERE owner_id = ?`,
      ).bind(ownerId).first();
      if (row) {
        assertConnectionOwner({ ownerId: row.owner_id, connectionId: row.connection_id }, ownerId);
        await env.DB.prepare(`DELETE FROM agentsam_cloudflare_connections WHERE owner_id = ?`).bind(ownerId).run();
      }
    }
    return json({ ok: true, status: 'not_configured' });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}
