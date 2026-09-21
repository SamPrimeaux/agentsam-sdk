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
import { decryptSecret, sealToken, vaultConfigured } from './vault.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function redirect(location) {
  return new Response(null, { status: 302, headers: { location } });
}

function settingsRedirect(url, result, error = '', returnTo = '') {
  const destination = returnTo ? new URL(returnTo) : new URL('/settings/integrations', url.origin);
  destination.searchParams.set('connection', 'cloudflare');
  destination.searchParams.set('result', result);
  if (error) destination.searchParams.set('error', error);
  return redirect(destination.toString());
}

function allowedReturnOrigins(url, env) {
  return new Set([
    url.origin,
    ...String(env.CLOUDFLARE_CONNECT_RETURN_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean),
  ]);
}

function resolveReturnTo(url, env) {
  const raw = url.searchParams.get('return_to') || '';
  if (!raw) return '';
  try {
    const destination = new URL(raw, url.origin);
    if (destination.protocol !== 'https:' && destination.origin !== url.origin) return '';
    return allowedReturnOrigins(url, env).has(destination.origin) ? destination.toString() : '';
  } catch {
    return '';
  }
}

async function deleteOAuthState(env, state) {
  if (env.DB) {
    await env.DB.prepare(
      `DELETE FROM agentsam_cloudflare_oauth_state WHERE state = ?`,
    ).bind(state).run();
  } else if (env.oauthState instanceof Map) {
    env.oauthState.delete(state);
  }
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
    created_at INTEGER,
    return_to TEXT
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS integration_resources (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    provider_resource_id TEXT,
    name TEXT,
    url TEXT,
    metadata_json TEXT DEFAULT '{}',
    synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  const stateInfo = env.DB.prepare(`PRAGMA table_info(agentsam_cloudflare_oauth_state)`);
  const stateColumns = typeof stateInfo.all === 'function' ? await stateInfo.all() : null;
  if (!(stateColumns?.results || []).some((column) => column.name === 'return_to')) {
    try {
      await env.DB.prepare(`ALTER TABLE agentsam_cloudflare_oauth_state ADD COLUMN return_to TEXT`).run();
    } catch {
      // A concurrent request may have added it between the pragma and ALTER.
    }
  }
}

async function seedKnownCloudflareResources(env, ownerId, connectionId, cloudflareAccountId) {
  if (!env?.DB?.prepare || !cloudflareAccountId) return;
  let configuredScopes = {};
  try { configuredScopes = JSON.parse(env.AGENTSAM_RESOURCE_SCOPE_JSON || '{}'); } catch { configuredScopes = {}; }
  const resources = [
    { key: 'agentsam-sdk', type: 'worker', id: 'agentsam-sdk', name: 'AgentSam SDK / Local Studio' },
    { key: 'agentsam-cad-creator', type: 'worker', id: 'agentsam-cad-creator', name: 'AgentSam CAD Creator' },
    { key: 'agentsam-client-cms-editor', type: 'worker', id: 'agentsam-client-cms-editor', name: 'AgentSam Client CMS Editor' },
    { key: 'fuelnfreetime', type: 'worker', id: 'fuelnfreetime', name: 'Fuel & Free Time', metadata: {
      zone_id: '816a5d2284103e4481987ceeb16c2ca9',
      d1_database_id: '9fd6ff92-e407-4b51-8b01-3c93f3845bb2',
      r2_bucket: 'fuelnfreetime',
      ...(configuredScopes.fuelnfreetime || {}),
    } },
  ];
  const statements = resources.map((resource) => env.DB.prepare(`
    INSERT OR REPLACE INTO integration_resources (
      id, tenant_id, connection_id, provider, resource_type, provider_resource_id,
      name, metadata_json, synced_at, updated_at
    ) VALUES (?, ?, ?, 'cloudflare', ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    `ires_cf_${cloudflareAccountId}_${resource.key}`,
    ownerId,
    connectionId,
    resource.type,
    resource.id,
    resource.name,
    JSON.stringify({ cloudflare_account_id: cloudflareAccountId, ...(resource.metadata || {}) }),
  ));
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
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
         FROM agentsam_cloudflare_connections
         WHERE owner_id = ? AND status = 'connected'
         ORDER BY updated_at DESC LIMIT 1`,
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
    const returnTo = resolveReturnTo(url, env);
    if (env.DB) {
      await env.DB.prepare(
        `INSERT INTO agentsam_cloudflare_oauth_state (state, owner_id, code_verifier, created_at, return_to)
         VALUES (?, ?, ?, unixepoch(), ?)`,
      ).bind(state, ownerId, verifier, returnTo || null).run();
    } else if (env.oauthState instanceof Map) {
      env.oauthState.set(state, { ownerId, verifier, returnTo });
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
    const providerError = url.searchParams.get('error') || '';
    let stored = null;
    if (env.DB) {
      stored = await env.DB.prepare(
        `SELECT owner_id, code_verifier, created_at, return_to
         FROM agentsam_cloudflare_oauth_state WHERE state = ?`,
      ).bind(state).first();
    } else if (env.oauthState instanceof Map) {
      stored = env.oauthState.get(state);
      if (stored) stored = { owner_id: stored.ownerId, code_verifier: stored.verifier, return_to: stored.returnTo || '' };
    }
    if (!stored) {
      // A callback without a one-time PKCE state is forged or expired. Keep
      // this as an explicit 403 instead of redirecting into a misleading UI.
      return json({ ok: false, error: 'cloudflare_connection_forbidden' }, 403);
    }
    if (!ownerId) ownerId = stored.owner_id;
    if (stored.owner_id !== ownerId) {
      return settingsRedirect(url, 'error', 'cloudflare_connection_forbidden', stored.return_to || '');
    }
    const createdAt = Number(stored.created_at || 0);
    const now = Math.floor(Date.now() / 1000);
    if (createdAt && now - createdAt > 10 * 60) {
      await deleteOAuthState(env, state);
      return settingsRedirect(url, 'error', 'oauth_state_expired', stored.return_to || '');
    }
    await deleteOAuthState(env, state);
    if (providerError) {
      return settingsRedirect(url, 'error', providerError, stored.return_to || '');
    }
    if (!code) {
      return settingsRedirect(url, 'error', 'authorization_code_missing', stored.return_to || '');
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
      console.error('cloudflare_token_exchange_failed', tokenRes.status);
      return settingsRedirect(url, 'error', 'token_exchange_failed', stored.return_to || '');
    }
    const tokens = await tokenRes.json();
    const connectionId = `cfconn_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    if (tokens.access_token && !vaultConfigured(env)) {
      return settingsRedirect(url, 'error', 'vault_unavailable', stored.return_to || '');
    }
    const aad = `cloudflare-connection:${ownerId}`;
    let accessEnc = null;
    let refreshEnc = null;
    try {
      accessEnc = await sealToken(env, tokens.access_token, aad);
      refreshEnc = await sealToken(env, tokens.refresh_token, aad);
    } catch (err) {
      return settingsRedirect(url, 'error', err.code || 'vault_unavailable', stored.return_to || '');
    }
    if (env.DB) {
      const removePrevious = env.DB.prepare(
        `UPDATE agentsam_cloudflare_connections
         SET status = 'superseded', access_token_encrypted = NULL,
             refresh_token_encrypted = NULL, updated_at = unixepoch()
         WHERE owner_id = ? AND status = 'connected'`,
      ).bind(ownerId);
      const insertConnection = env.DB.prepare(
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
      );
      if (typeof env.DB.batch === 'function') {
        await env.DB.batch([removePrevious, insertConnection]);
      } else {
        await removePrevious.run();
        await insertConnection.run();
      }
      await seedKnownCloudflareResources(env, ownerId, connectionId, tokens.account_id || null);
    }
    return settingsRedirect(url, 'connected', '', stored.return_to || '');
  }

  if (url.pathname === '/api/connections/cloudflare/disconnect' && request.method === 'POST') {
    let providerRevoked = false;
    if (env.DB) {
      const row = await env.DB.prepare(
        `SELECT connection_id, owner_id, access_token_encrypted
         FROM agentsam_cloudflare_connections
         WHERE owner_id = ? AND status = 'connected'
         ORDER BY updated_at DESC LIMIT 1`,
      ).bind(ownerId).first();
      if (row) {
        assertConnectionOwner({ ownerId: row.owner_id, connectionId: row.connection_id }, ownerId);
        if (row.access_token_encrypted) {
          try {
            const token = await decryptSecret(env, row.access_token_encrypted, `cloudflare-connection:${ownerId}`);
            const revokeParams = new URLSearchParams({ token, client_id: String(env.CLOUDFLARE_OAUTH_CLIENT_ID) });
            if (env.CLOUDFLARE_OAUTH_CLIENT_SECRET) {
              revokeParams.set('client_secret', String(env.CLOUDFLARE_OAUTH_CLIENT_SECRET));
            }
            const revokeResponse = await fetch(CLOUDFLARE_OAUTH_REVOKE_URL, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: revokeParams,
            });
            providerRevoked = revokeResponse.ok;
          } catch (error) {
            console.error('cloudflare_token_revoke_failed', String(error?.message || error));
          }
        }
        await env.DB.prepare(`
          UPDATE agentsam_cloudflare_connections
          SET status = 'revoked', access_token_encrypted = NULL,
              refresh_token_encrypted = NULL, expires_at = unixepoch(), updated_at = unixepoch()
          WHERE connection_id = ? AND owner_id = ?
        `).bind(row.connection_id, ownerId).run();
      }
    }
    return json({ ok: true, status: 'not_configured', provider_revoked: providerRevoked });
  }

  return json({ ok: false, error: 'not_found' }, 404);
}
