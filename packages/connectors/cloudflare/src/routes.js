import {
  CLOUDFLARE_CALLBACK_PATH,
  CLOUDFLARE_OAUTH_TOKEN_URL,
  CLOUDFLARE_OAUTH_REVOKE_URL,
  buildAuthorizeUrl,
  cloudflareConnectionSafeStatus,
  resolveCloudflareOAuthClient,
  requestedCloudflareScopes,
  assertConnectionOwner,
  upsertCloudflareUserOauthToken,
} from './index.js';
import { resolveAuthenticatedOwner } from './owner.js';
import { decryptSecret, sealToken, vaultConfigured } from './vault.js';

const OAUTH_STATE_PROVIDER = 'cloudflare';
const OAUTH_STATE_TTL_SECONDS = 600;

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

function resolveReturnTo(url) {
  const raw = url.searchParams.get('return_to') || '';
  if (!raw) return '';
  try {
    const destination = new URL(raw, url.origin);
    return destination.origin === url.origin ? destination.toString() : '';
  } catch {
    return '';
  }
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashOAuthState(state) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(state || '')));
  return bytesToHex(new Uint8Array(digest));
}

function oauthStateAad(ownerId) {
  return `oauth_state_nonces:${OAUTH_STATE_PROVIDER}:${ownerId}`;
}

async function deleteOAuthState(env, state) {
  if (env.DB) {
    const stateHash = await hashOAuthState(state);
    await env.DB.prepare(
      `DELETE FROM oauth_state_nonces WHERE state_hash = ? AND provider = ?`,
    ).bind(stateHash, OAUTH_STATE_PROVIDER).run();
  } else if (env.oauthState instanceof Map) {
    env.oauthState.delete(state);
  }
}

async function saveOAuthState(env, { state, ownerId, verifier, returnTo }) {
  // In-memory fixture path (tests / local without vault).
  if (env.oauthState instanceof Map && (!env.DB || !vaultConfigured(env))) {
    env.oauthState.set(state, { ownerId, verifier, returnTo, createdAt: Math.floor(Date.now() / 1000) });
    return { ok: true };
  }
  if (!env.DB) return { ok: false, error: 'db_unavailable' };
  if (!vaultConfigured(env)) return { ok: false, error: 'vault_unavailable' };
  const stateHash = await hashOAuthState(state);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + OAUTH_STATE_TTL_SECONDS;
  const encrypted = await sealToken(env, verifier, oauthStateAad(ownerId));
  const id = `osn_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  await env.DB.prepare(
    `DELETE FROM oauth_state_nonces
     WHERE provider = ? AND (expires_at < ? OR consumed_at IS NOT NULL)`,
  ).bind(OAUTH_STATE_PROVIDER, now).run();
  await env.DB.prepare(
    `INSERT INTO oauth_state_nonces (
       id, tenant_id, user_id, provider, state_hash, code_verifier_encrypted,
       redirect_after, metadata_json, expires_at, consumed_at, created_at
     ) VALUES (?, NULL, ?, ?, ?, ?, ?, '{}', ?, NULL, ?)`,
  ).bind(id, ownerId, OAUTH_STATE_PROVIDER, stateHash, encrypted, returnTo || null, expiresAt, now).run();
  return { ok: true };
}

async function consumeOAuthState(env, state) {
  if (env.oauthState instanceof Map && (!env.DB || env.oauthState.has(state))) {
    const stored = env.oauthState.get(state);
    if (!stored) {
      // Fall through to D1 when Map miss and DB present.
    } else {
      env.oauthState.delete(state);
      return {
        owner_id: stored.ownerId,
        code_verifier: stored.verifier,
        return_to: stored.returnTo || '',
        created_at: stored.createdAt || 0,
      };
    }
  }
  if (!env.DB) return null;
  const stateHash = await hashOAuthState(state);
  const row = await env.DB.prepare(
    `SELECT id, user_id, code_verifier_encrypted, redirect_after, expires_at, created_at, consumed_at
     FROM oauth_state_nonces
     WHERE state_hash = ? AND provider = ?
     LIMIT 1`,
  ).bind(stateHash, OAUTH_STATE_PROVIDER).first();
  if (!row || row.consumed_at) return null;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE oauth_state_nonces SET consumed_at = ? WHERE id = ?`,
  ).bind(now, row.id).run();
  if (Number(row.expires_at) <= now) return null;
  if (!vaultConfigured(env) || !row.code_verifier_encrypted) return null;
  const verifier = await decryptSecret(env, row.code_verifier_encrypted, oauthStateAad(row.user_id));
  return {
    owner_id: row.user_id,
    code_verifier: verifier,
    return_to: row.redirect_after || '',
    created_at: row.created_at,
  };
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
  // Canonical multi-provider PKCE state (encrypted verifier). Replaces agentsam_cloudflare_oauth_state.
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS oauth_state_nonces (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    provider TEXT NOT NULL,
    state_hash TEXT NOT NULL,
    code_verifier_encrypted TEXT,
    redirect_after TEXT,
    metadata_json TEXT DEFAULT '{}',
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
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
}

/**
 * Optional host-declared resources only — never bake product account IDs here.
 * Shape: env.AGENTSAM_RESOURCE_SCOPE_JSON = { "resources": [ { key, type, id, name, metadata? } ] }
 */
async function seedKnownCloudflareResources(env, ownerId, connectionId, cloudflareAccountId) {
  if (!env?.DB?.prepare || !cloudflareAccountId) return;
  let configured = {};
  try { configured = JSON.parse(env.AGENTSAM_RESOURCE_SCOPE_JSON || '{}'); } catch { configured = {}; }
  const resources = Array.isArray(configured.resources) ? configured.resources : [];
  if (!resources.length) return;
  const statements = resources.map((resource) => env.DB.prepare(`
    INSERT OR REPLACE INTO integration_resources (
      id, tenant_id, connection_id, provider, resource_type, provider_resource_id,
      name, metadata_json, synced_at, updated_at
    ) VALUES (?, ?, ?, 'cloudflare', ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    `ires_cf_${cloudflareAccountId}_${resource.key}`,
    ownerId,
    connectionId,
    resource.type || 'worker',
    resource.id || resource.key,
    resource.name || resource.key,
    JSON.stringify({ cloudflare_account_id: cloudflareAccountId, ...(resource.metadata || {}) }),
  ));
  if (typeof env.DB.batch === 'function') await env.DB.batch(statements);
  else for (const statement of statements) await statement.run();
}

/**
 * @param {Request} request
 * @param {object} env
 * @param {{ defaultCapabilities?: string[] }} [options]
 *   Host app supplies default capability ids when the request omits ?capabilities=.
 *   The connector package itself has no product-specific default set.
 */
export async function handleCloudflareConnectionRequest(request, env, options = {}) {
  const url = new URL(request.url);
  const client = resolveCloudflareOAuthClient(env);
  const hostDefaultCapabilities = Array.isArray(options.defaultCapabilities)
    ? options.defaultCapabilities.filter(Boolean)
    : [];
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
      // Prefer canonical spine; fall back to legacy dual-read.
      try {
        const spine = await env.DB.prepare(
          `SELECT id, user_id, account_identifier, scopes, scope, expires_at,
                  metadata_json, updated_at, created_at, is_active
           FROM user_oauth_tokens
           WHERE user_id = ? AND LOWER(provider) = 'cloudflare'
             AND COALESCE(is_active, 1) = 1
             AND (revoked_at IS NULL OR revoked_at = 0)
           ORDER BY updated_at DESC LIMIT 1`,
        ).bind(ownerId).first();
        if (spine) {
          connection = {
            connectionId: spine.id != null ? String(spine.id) : `uot_${ownerId}`,
            ownerId,
            cloudflareAccountId: spine.account_identifier || null,
            scopes: String(spine.scopes || spine.scope || '').split(/[\s,]+/).filter(Boolean),
            status: 'connected',
            createdAt: spine.created_at,
            updatedAt: spine.updated_at,
            expiresAt: spine.expires_at,
          };
        }
      } catch { /* table may be missing on fixtures */ }
      if (!connection) {
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
    }
    return json({ ok: true, ...cloudflareConnectionSafeStatus(env, connection, ownerId) });
  }

  if (url.pathname === '/api/connections/cloudflare/start' && request.method === 'GET') {
    const state = crypto.randomUUID().replace(/-/g, '');
    const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
    const verifier = btoa(String.fromCharCode(...verifierBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const returnTo = resolveReturnTo(url);
    const saved = await saveOAuthState(env, { state, ownerId, verifier, returnTo });
    if (!saved.ok) {
      return json({
        ok: false,
        error: saved.error || 'oauth_state_unavailable',
        message: saved.error === 'vault_unavailable'
          ? 'VAULT_MASTER_KEY required to encrypt OAuth PKCE verifier'
          : 'oauth state store unavailable',
      }, 503);
    }
    const redirectUri = `${url.origin}${CLOUDFLARE_CALLBACK_PATH}`;
    const capabilityParam = url.searchParams.get('capabilities') || url.searchParams.get('capability') || '';
    const packsParam = url.searchParams.get('packs') || url.searchParams.get('pack') || '';
    const requested = capabilityParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const requestedPacks = packsParam
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    // Host-supplied defaults only — never a product-named constant inside this package.
    const capabilitySet = requested.length ? requested : hostDefaultCapabilities;
    const scopes = requestedCloudflareScopes({
      capabilities: capabilitySet,
      packs: requestedPacks,
    });
    const authorize = buildAuthorizeUrl({
      clientId: String(env.CLOUDFLARE_OAUTH_CLIENT_ID),
      redirectUri,
      state,
      codeChallenge: challenge,
      scopes,
    });
    // Browser navigation → 302 to Cloudflare. XHR/fetch (Integrations UI) → JSON.
    const accept = String(request.headers.get('accept') || '');
    const mode = String(request.headers.get('sec-fetch-mode') || '');
    const wantsJson = accept.includes('application/json')
      || mode === 'cors'
      || request.headers.get('x-agentsam-oauth') === 'json';
    if (!wantsJson) {
      return Response.redirect(authorize, 302);
    }
    return json({
      ok: true,
      authorize_url: authorize,
      callback: CLOUDFLARE_CALLBACK_PATH,
      capabilities: capabilitySet,
      scopes,
    });
  }

  if (url.pathname === CLOUDFLARE_CALLBACK_PATH && request.method === 'GET') {
    const code = url.searchParams.get('code') || '';
    const state = url.searchParams.get('state') || '';
    const providerError = url.searchParams.get('error') || '';
    let stored = null;
    try {
      stored = await consumeOAuthState(env, state);
    } catch (err) {
      console.error('cloudflare_oauth_state_consume_failed', String(err?.message || err));
      return settingsRedirect(url, 'error', 'oauth_state_unavailable', '');
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
    if (createdAt && now - createdAt > OAUTH_STATE_TTL_SECONDS) {
      return settingsRedirect(url, 'error', 'oauth_state_expired', stored.return_to || '');
    }
    if (providerError) {
      return settingsRedirect(url, 'error', providerError, stored.return_to || '');
    }
    if (!code) {
      return settingsRedirect(url, 'error', 'authorization_code_missing', stored.return_to || '');
    }
    // This is Cloudflare's public PKCE client (Token Authentication Method:
    // None). Do not add client_secret, even if an obsolete Worker binding is
    // present; a mixed-auth exchange is rejected by Cloudflare.
    const tokenParams = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}${CLOUDFLARE_CALLBACK_PATH}`,
      client_id: String(env.CLOUDFLARE_OAUTH_CLIENT_ID),
      code_verifier: stored.code_verifier,
    };
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
    const grantedScopeStr = tokens.scope || requestedCloudflareScopes({ capabilities: hostDefaultCapabilities }).join(' ');
    const capabilitySet = hostDefaultCapabilities.slice();

    // Canonical spine: user_oauth_tokens (scope union + client_id provenance).
    let spine = null;
    try {
      spine = await upsertCloudflareUserOauthToken(env, {
        userId: ownerId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        scopes: grantedScopeStr,
        accountId: tokens.account_id || null,
        expiresAt: tokens.expires_in
          ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in)
          : null,
        clientId: String(env.CLOUDFLARE_OAUTH_CLIENT_ID || ''),
        capabilitySet,
      });
      if (!spine?.ok) {
        console.error('cloudflare_user_oauth_tokens_upsert_failed', spine?.error || 'unknown');
      }
    } catch (err) {
      console.error('cloudflare_user_oauth_tokens_upsert_threw', String(err?.message || err));
    }

    if (tokens.access_token && !vaultConfigured(env)) {
      if (spine?.ok) {
        return settingsRedirect(url, 'connected', '', stored.return_to || '');
      }
      return settingsRedirect(url, 'error', 'vault_unavailable', stored.return_to || '');
    }
    const aad = `cloudflare-connection:${ownerId}`;
    let accessEnc = null;
    let refreshEnc = null;
    try {
      accessEnc = await sealToken(env, tokens.access_token, aad);
      refreshEnc = await sealToken(env, tokens.refresh_token, aad);
    } catch (err) {
      if (spine?.ok) {
        return settingsRedirect(url, 'connected', '', stored.return_to || '');
      }
      return settingsRedirect(url, 'error', err.code || 'vault_unavailable', stored.return_to || '');
    }
    if (env.DB) {
      try {
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
          spine?.accountId || tokens.account_id || null,
          (spine?.scopes || []).join(' ') || grantedScopeStr,
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
        await seedKnownCloudflareResources(
          env,
          ownerId,
          connectionId,
          spine?.accountId || tokens.account_id || null,
        );
      } catch (err) {
        console.error('cloudflare_legacy_connection_write_failed', String(err?.message || err));
        if (!spine?.ok) {
          return settingsRedirect(url, 'error', 'connection_persist_failed', stored.return_to || '');
        }
      }
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
