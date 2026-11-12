/**
 * Cloudflare credential resolution — OAuth connection OR API token.
 *
 * Authority law:
 * - OAuth (user_oauth_tokens, provider=cloudflare) is the Local Studio product path — SSOT
 * - CLOUDFLARE_API_TOKEN remains valid for CLI / CI / headless
 * - CLOUDFLARE_IMAGES_API_TOKEN is Images-family only — never a generic CF API fallback
 *
 * Never serialize bearerToken in status APIs or receipts.
 */

import { decryptSecret, vaultConfigured } from './vault.js';
import { oauthAad, sealOauthToken, unsealOauthToken } from '../../../agentsam-vault/src/crypto/oauth-envelope.js';
import { getCloudflareCapability } from './capabilities.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function scopesFromRow(row) {
  if (!row) return [];
  if (row.scopes) return String(row.scopes).split(/[\s,]+/).filter(Boolean);
  return [];
}

function parseRowMeta(row) {
  if (!row?.metadata_json) return {};
  try {
    const meta = typeof row.metadata_json === 'object'
      ? row.metadata_json
      : JSON.parse(String(row.metadata_json));
    return meta && typeof meta === 'object' ? meta : {};
  } catch {
    return {};
  }
}

function accountIdFromRow(row) {
  const stored = clean(row?.account_identifier);
  if (/^[a-f0-9]{32}$/i.test(stored)) return stored;
  const meta = parseRowMeta(row);
  const fromMeta = clean(meta.cloudflare_account_id || meta.account_id);
  if (/^[a-f0-9]{32}$/i.test(fromMeta)) return fromMeta;
  return null;
}

function isPreferredRow(row) {
  return parseRowMeta(row).is_preferred === true;
}

function pickPreferredOauthRow(rows = []) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  if (!list.length) return { row: null, preferred: false, ambiguous: false };
  const preferred = list.find((row) => isPreferredRow(row));
  if (preferred) return { row: preferred, preferred: true, ambiguous: false };
  if (list.length === 1) return { row: list[0], preferred: false, ambiguous: false };
  return { row: null, preferred: false, ambiguous: true, rows: list };
}

function accountChoiceFromRow(row) {
  return {
    connectionId: clean(row.account_identifier),
    cloudflareAccountId: accountIdFromRow(row),
    accountLabel: row.account_display || row.account_email || row.account_identifier,
    preferred: isPreferredRow(row),
  };
}

function oauthVaultMaterial(env) {
  return clean(env?.VAULT_MASTER_KEY || env?.VAULT_KEY);
}

/**
 * Map a user_oauth_tokens Cloudflare row → connection status record
 * (replaces agentsam_cloudflare_connections shape for APIs / registry).
 */
export function mapCloudflareOauthRowToConnection(row, ownerId) {
  if (!row) return null;
  const active = Number(row.is_active ?? 1) === 1 && !(Number(row.revoked_at) > 0);
  let metaStatus = null;
  try {
    metaStatus = row.metadata_json ? JSON.parse(row.metadata_json)?.status : null;
  } catch {
    metaStatus = null;
  }
  // user_oauth_tokens PK is (account_id, provider, account_identifier) — no `id` column.
  // connectionId remains the Cloudflare account id in this SSOT (one grant row per account).
  const accountKey = clean(row.account_identifier) || `cf_oauth_${ownerId}`;
  const meta = parseRowMeta(row);
  return {
    connectionId: accountKey,
    ownerId,
    cloudflareAccountId: accountIdFromRow(row),
    accountLabel: row.account_display || row.account_email || accountIdFromRow(row) || accountKey,
    scopes: scopesFromRow(row),
    status: active ? 'connected' : (metaStatus === 'superseded' ? 'superseded' : 'revoked'),
    preferred: meta.is_preferred === true,
    preferredAt: meta.preferred_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

/**
 * List active Cloudflare OAuth connections for an owner (no token decrypt).
 * Multi-account: caller must pick explicitly — never silently substitute env account id.
 */
export async function listCloudflareConnectionRecords(env, ownerId) {
  if (!env?.DB || !ownerId) return [];
  try {
    const out = await env.DB.prepare(`
      SELECT account_id, provider, account_identifier, json_extract(metadata_json, '$.display') AS account_display,
             json_extract(metadata_json, '$.email') AS account_email,
             scopes, expires_at, metadata_json, is_active, revoked_at,
             created_at, updated_at
      FROM user_oauth_tokens
      WHERE account_id = ? AND LOWER(provider) = 'cloudflare'
        AND COALESCE(is_active, 1) = 1
        AND (revoked_at IS NULL OR revoked_at = 0)
      ORDER BY updated_at DESC
    `).bind(ownerId).all();
    return (out?.results || [])
      .map((row) => mapCloudflareOauthRowToConnection(row, ownerId))
      .filter(Boolean);
  } catch (err) {
    console.error('listCloudflareConnectionRecords_failed', String(err?.message || err));
    return [];
  }
}

/**
 * Load active Cloudflare connection metadata from user_oauth_tokens (no token decrypt).
 * Pass connectionId / accountId to select explicitly when multiple accounts exist.
 */
export async function loadCloudflareConnectionRecord(env, ownerId, options = {}) {
  if (!env?.DB || !ownerId) return null;
  const preferred = clean(options.connectionId || options.accountId || options.cloudflareAccountId);
  let row;
  try {
    if (preferred) {
      row = await env.DB.prepare(`
        SELECT account_id, provider, account_identifier, json_extract(metadata_json, '$.display') AS account_display,
             json_extract(metadata_json, '$.email') AS account_email,
               scopes, expires_at, metadata_json, is_active, revoked_at,
               created_at, updated_at
        FROM user_oauth_tokens
        WHERE account_id = ? AND LOWER(provider) = 'cloudflare'
          AND account_identifier = ?
          AND COALESCE(is_active, 1) = 1
          AND (revoked_at IS NULL OR revoked_at = 0)
        LIMIT 1
      `).bind(ownerId, preferred).first();
    } else {
      // Status SSOT: any valid OAuth row means connected (MCP/Settings must not
      // show "Need connection"). Prefer explicit preferred account; otherwise expose picker.
      const connections = await listCloudflareConnectionRecords(env, ownerId);
      if (!connections.length) return null;
      const preferred = connections.find((c) => c.preferred === true);
      const selected = preferred || connections[0];
      selected.accounts = connections.map((c) => ({
        connectionId: c.connectionId,
        cloudflareAccountId: c.cloudflareAccountId,
        accountLabel: c.accountLabel || c.cloudflareAccountId,
        preferred: c.preferred === true,
      }));
      selected.account_selection_required = !preferred && connections.length > 1;
      selected.preferred_connection_id = preferred?.connectionId || null;
      return selected;
    }
  } catch (err) {
    console.error('loadCloudflareConnectionRecord_failed', String(err?.message || err));
    return null;
  }
  return mapCloudflareOauthRowToConnection(row, ownerId);
}

const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const REFRESH_SKEW_SECONDS = 120;

async function decryptRefreshToken(env, row, ownerId, accountId, options = {}) {
  let refreshToken = '';
  const material = oauthVaultMaterial(env);
  if (!refreshToken && row.refresh_token_encrypted && material && accountId) {
    try {
      refreshToken = clean(await unsealOauthToken(
        material,
        row.refresh_token_encrypted,
        oauthAad('cloudflare', ownerId, accountId),
      ));
    } catch {
      /* fall through */
    }
  }
  if (!refreshToken && row.refresh_token_encrypted && options.decryptUserOauthToken) {
    try {
      refreshToken = clean(await options.decryptUserOauthToken(env, row.refresh_token_encrypted));
    } catch {
      /* ignore */
    }
  }
  if (!refreshToken && row.refresh_token_encrypted && vaultConfigured(env) && material) {
    try {
      refreshToken = clean(await decryptSecret(env, row.refresh_token_encrypted, `cloudflare-connection:${ownerId}`));
    } catch {
      /* ignore */
    }
  }
  return refreshToken || null;
}

/**
 * Refresh Cloudflare OAuth access token (public PKCE client — no client_secret).
 * Persists rotated tokens back to user_oauth_tokens; never returns refresh token.
 */
export async function refreshCloudflareUserOauthToken(env, ownerId, row, options = {}) {
  const accountId = accountIdFromRow(row);
  if (!accountId) return { ok: false, error: 'cloudflare_account_identifier_required' };
  const refreshToken = await decryptRefreshToken(env, row, ownerId, accountId, options);
  if (!refreshToken) return { ok: false, error: 'cloudflare_refresh_token_missing' };
  const clientId = clean(env?.CLOUDFLARE_OAUTH_CLIENT_ID);
  if (!clientId) return { ok: false, error: 'cloudflare_oauth_client_missing' };

  const tokenRes = await (options.fetchImpl || fetch)(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => '');
    try {
      await env.DB.prepare(`
        UPDATE user_oauth_tokens
        SET last_refresh_error_code = ?,
            refresh_failure_count = COALESCE(refresh_failure_count, 0) + 1,
            updated_at = unixepoch()
        WHERE account_id = ? AND LOWER(provider) = 'cloudflare' AND account_identifier = ?
      `).bind(`http_${tokenRes.status}`, ownerId, accountId).run();
    } catch {
      /* best effort */
    }
    return {
      ok: false,
      error: tokenRes.status === 401 || tokenRes.status === 403
        ? 'cloudflare_reconnect_required'
        : 'cloudflare_token_refresh_failed',
      detail: detail.slice(0, 240),
    };
  }
  const tokens = await tokenRes.json().catch(() => null);
  if (!tokens?.access_token) {
    return { ok: false, error: 'cloudflare_token_refresh_invalid' };
  }

  const { upsertCloudflareUserOauthToken } = await import('./oauth-persist.js');
  const spine = await upsertCloudflareUserOauthToken(env, {
    userId: ownerId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || refreshToken,
    scopes: tokens.scope || row.scopes || '',
    accountId,
    accountDisplay: row.account_display || null,
    expiresAt: tokens.expires_in
      ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in)
      : null,
    clientId,
  });
  if (!spine?.ok) return { ok: false, error: spine?.error || 'cloudflare_token_persist_failed' };

  try {
    await env.DB.prepare(`
      UPDATE user_oauth_tokens
      SET last_refresh_at = unixepoch(),
          last_refresh_error_code = NULL,
          refresh_failure_count = 0,
          updated_at = unixepoch()
      WHERE account_id = ? AND LOWER(provider) = 'cloudflare' AND account_identifier = ?
    `).bind(ownerId, accountId).run();
  } catch {
    /* optional columns */
  }

  return {
    ok: true,
    accessToken: tokens.access_token,
    accountId,
    expiresAt: spine.expiresAt || (tokens.expires_in
      ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in)
      : null),
    grantedScopes: Array.isArray(spine.scopes) ? spine.scopes : scopesFromRow({ scopes: tokens.scope }),
  };
}

/**
 * Repair only the specific false-inactive state produced by a different
 * first-party app failing to decrypt the shared PKCE refresh envelope.
 * Never revive an explicitly revoked grant. Cloudflare must accept a fresh
 * refresh-token exchange before this connector reactivates the row.
 */
async function recoverCrossHostRefreshFailure(env, ownerId, preferred, options = {}) {
  if (!oauthVaultMaterial(env) || !clean(env?.CLOUDFLARE_OAUTH_CLIENT_ID)) return false;
  let rows = [];
  try {
    const result = await env.DB.prepare(`
      SELECT account_id, provider, account_identifier,
        json_extract(metadata_json, '$.display') AS account_display,
        access_token_encrypted, refresh_token_encrypted,
        scopes, expires_at, metadata_json, is_active
      FROM user_oauth_tokens
      WHERE account_id = ? AND LOWER(provider) = 'cloudflare'
        AND COALESCE(is_active, 1) = 0 AND revoked_at IS NULL
        AND last_refresh_error_code = 'REFRESH_TOKEN_MISSING'
        AND refresh_token_encrypted IS NOT NULL
    `).bind(ownerId).all();
    rows = result?.results || [];
  } catch {
    return false;
  }
  const candidates = preferred
    ? rows.filter((row) => accountIdFromRow(row) === preferred)
    : rows.filter((row) => isPreferredRow(row));
  const selected = candidates.length === 1 ? candidates[0]
    : !preferred && rows.length === 1 ? rows[0] : null;
  if (!selected) return false;
  try {
    const result = await refreshCloudflareUserOauthToken(env, ownerId, selected, options);
    return Boolean(result?.ok);
  } catch {
    return false;
  }
}

/**
 * Load Cloudflare credential from user_oauth_tokens (SSOT).
 * Decrypt order: plaintext → host decryptUserOauthToken → connector vault AAD.
 * Pass connectionId / accountId for explicit multi-account selection.
 */
export async function loadCloudflareFromUserOauthTokens(env, ownerId, options = {}) {
  if (!env?.DB || !ownerId) return null;
  const preferred = clean(options.connectionId || options.accountId || options.cloudflareAccountId);
  let row;
  try {
    if (preferred) {
      row = await env.DB.prepare(`
        SELECT account_id, provider, account_identifier, json_extract(metadata_json, '$.display') AS account_display,
             json_extract(metadata_json, '$.email') AS account_email,
               access_token_encrypted, refresh_token_encrypted,
               scopes, expires_at, metadata_json, is_active
        FROM user_oauth_tokens
        WHERE account_id = ? AND LOWER(provider) = 'cloudflare'
          AND account_identifier = ?
          AND COALESCE(is_active, 1) = 1
          AND (revoked_at IS NULL OR revoked_at = 0)
        LIMIT 1
      `).bind(ownerId, preferred).first();
    } else {
      const listSql = `
        SELECT account_id, provider, account_identifier, json_extract(metadata_json, '$.display') AS account_display,
             json_extract(metadata_json, '$.email') AS account_email,
               access_token_encrypted, refresh_token_encrypted,
               scopes, expires_at, metadata_json, is_active
        FROM user_oauth_tokens
        WHERE account_id = ? AND LOWER(provider) = 'cloudflare'
          AND COALESCE(is_active, 1) = 1
          AND (revoked_at IS NULL OR revoked_at = 0)
        ORDER BY updated_at DESC`;
      let rows = [];
      try {
        const listed = await env.DB.prepare(listSql).bind(ownerId).all();
        rows = listed?.results || [];
      } catch {
        rows = [];
      }
      // Fixtures / older D1 shims may only implement first().
      if (!rows.length) {
        const single = await env.DB.prepare(`${listSql} LIMIT 1`).bind(ownerId).first();
        if (single) rows = [single];
      }
      const picked = pickPreferredOauthRow(rows);
      if (picked.ambiguous && !options.allowLatestFallback) {
        const err = new Error('cloudflare_account_selection_required');
        err.code = 'cloudflare_account_selection_required';
        err.accounts = (picked.rows || rows).map((r) => accountChoiceFromRow(r));
        throw err;
      }
      row = picked.row || rows[0] || null;
    }
  } catch (err) {
    if (err?.code === 'cloudflare_account_selection_required') throw err;
    // Table may not exist on SDK-only D1 fixtures
    console.error('loadCloudflareFromUserOauthTokens_failed', String(err?.message || err));
    return null;
  }
  if (!row) {
    if (options._crossHostRecoveryAttempted) return null;
    const recovered = await recoverCrossHostRefreshFailure(env, ownerId, preferred, options);
    if (!recovered) return null;
    // Follow the original row selection rules after provider-verified recovery.
    return loadCloudflareFromUserOauthTokens(env, ownerId, {
      ...options,
      _crossHostRecoveryAttempted: true,
    });
  }

  const accountId = accountIdFromRow(row);
  let accessToken = '';
  const material = oauthVaultMaterial(env);

  if (!accessToken && row.access_token_encrypted && material && accountId) {
    try {
      accessToken = clean(await unsealOauthToken(
        material,
        row.access_token_encrypted,
        oauthAad('cloudflare', ownerId, accountId),
      ));
    } catch {
      /* fall through to legacy host/connector formats */
    }
  }

  if (!accessToken && row.access_token_encrypted && options.decryptUserOauthToken) {
    try {
      accessToken = clean(await options.decryptUserOauthToken(env, row.access_token_encrypted));
    } catch {
      /* host legacy vault packing may differ — fall through */
    }
  }

  // Migration path for the pre-v2 Local Studio connector format:
  // raw AES key + AAD cloudflare-connection:<owner>. If we can open it, re-seal
  // both tokens immediately into the portable OAuth envelope.
  if (!accessToken && row.access_token_encrypted && vaultConfigured(env) && material && accountId) {
    try {
      const legacyAad = `cloudflare-connection:${ownerId}`;
      accessToken = clean(await decryptSecret(env, row.access_token_encrypted, legacyAad));
      if (accessToken) {
        const aad = oauthAad('cloudflare', ownerId, accountId);
        const accessEnc = await sealOauthToken(material, accessToken, aad);
        let refreshEnc = row.refresh_token_encrypted || null;
        if (row.refresh_token_encrypted) {
          const refreshToken = clean(await decryptSecret(env, row.refresh_token_encrypted, legacyAad));
          refreshEnc = refreshToken ? await sealOauthToken(material, refreshToken, aad) : null;
        }
        await env.DB.prepare(`
          UPDATE user_oauth_tokens
          SET access_token_encrypted = ?, refresh_token_encrypted = ?,
              last_refresh_error_code = NULL, refresh_failure_count = 0,
              is_active = 1, revoked_at = NULL, updated_at = unixepoch()
          WHERE account_id = ? AND LOWER(provider) = 'cloudflare' AND account_identifier = ?
        `).bind(accessEnc, refreshEnc, ownerId, accountId).run();
      }
    } catch {
      /* unreadable legacy connector ciphertext — leave null */
    }
  }

  if (!accessToken) return null;

  let expiresAt = row.expires_at ? Number(row.expires_at) : null;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt <= now + REFRESH_SKEW_SECONDS) {
    const refreshed = await refreshCloudflareUserOauthToken(env, ownerId, row, options);
    if (refreshed?.ok && refreshed.accessToken) {
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt || expiresAt;
    } else if (refreshed?.error === 'cloudflare_reconnect_required') {
      const err = new Error('cloudflare_reconnect_required');
      err.code = 'cloudflare_reconnect_required';
      err.detail = refreshed.detail || null;
      throw err;
    }
  }

  return {
    bearerToken: accessToken,
    accountId,
    source: 'oauth_connection',
    connectionId: accountId || (row.id != null ? String(row.id) : null),
    grantedScopes: scopesFromRow(row),
    expiresAt,
    accountLabel: row.account_display || row.account_email || accountId || null,
    provider: 'cloudflare',
  };
}

/**
 * @deprecated Removed — user_oauth_tokens is SSOT. Kept as no-op for import compatibility.
 */
export async function loadCloudflareFromLegacyConnections() {
  return null;
}

/**
 * @param {object} opts
 * @param {'auto'|'oauth'|'token'} [opts.authMode]
 * @returns {Promise<{
 *   bearerToken: string|null,
 *   accountId: string|null,
 *   source: 'explicit'|'oauth_connection'|'api_token'|'images_api_token'|'missing',
 *   connectionId: string|null,
 *   grantedScopes: string[],
 *   expiresAt: number|null,
 *   capabilityId: string|null,
 *   status: 'ready'|'authorization_required'|'token_required'|'configuration_required',
 * }>}
 */
export async function resolveCloudflareCredential(opts = {}) {
  const {
    env = process.env,
    ownerId = '',
    capabilityId = null,
    explicitToken = '',
    explicitAccountId = '',
    authMode = 'auto',
    decryptUserOauthToken = null,
  } = opts;

  // User OAuth path: never substitute CLOUDFLARE_ACCOUNT_ID for the selected connection.
  // Env account id is only for explicit service/token identities (CLI/CI).
  const explicitAccount = clean(explicitAccountId || opts.connectionId || opts.cloudflareAccountId);
  const envAccountFallback = authMode === 'oauth' ? '' : clean(env.CLOUDFLARE_ACCOUNT_ID);
  const accountFallback = clean(explicitAccount || envAccountFallback);
  const cap = capabilityId ? getCloudflareCapability(capabilityId) : null;

  const pack = (partial) => ({
    bearerToken: null,
    accountId: accountFallback || null,
    source: 'missing',
    connectionId: null,
    grantedScopes: [],
    expiresAt: null,
    capabilityId: capabilityId || null,
    accountLabel: null,
    status: 'authorization_required',
    ...partial,
  });

  // 1. Explicit internal credential (never from CLI argv)
  if (clean(explicitToken)) {
    return pack({
      bearerToken: clean(explicitToken),
      accountId: accountFallback || null,
      source: 'explicit',
      status: 'ready',
    });
  }

  const wantOauth = authMode === 'auto' || authMode === 'oauth';
  const wantToken = authMode === 'auto' || authMode === 'token';

  // 2. Connected OAuth — user_oauth_tokens only
  if (wantOauth && ownerId) {
    try {
      const canonical = await loadCloudflareFromUserOauthTokens(env, ownerId, {
        decryptUserOauthToken,
        connectionId: explicitAccount || undefined,
        accountId: explicitAccount || undefined,
        // Product OAuth must pick when multi-account; auto/CLI may use latest once.
        allowLatestFallback: authMode !== 'oauth',
        fetchImpl: opts.fetchImpl,
      });
      if (canonical?.bearerToken) {
        return pack({
          ...canonical,
          // Prefer the OAuth row account — never fill from CLOUDFLARE_ACCOUNT_ID on oauth mode.
          accountId: canonical.accountId || (authMode === 'oauth' ? null : accountFallback) || null,
          status: 'ready',
        });
      }
    } catch (err) {
      if (err?.code === 'cloudflare_account_selection_required') {
        return pack({
          source: 'oauth_connection',
          status: 'configuration_required',
          error: 'cloudflare_account_selection_required',
          accounts: err.accounts || [],
        });
      }
      if (err?.code === 'cloudflare_reconnect_required') {
        return pack({
          source: 'oauth_connection',
          status: 'authorization_required',
          error: 'cloudflare_reconnect_required',
        });
      }
      throw err;
    }
    if (authMode === 'oauth') {
      return pack({
        source: 'missing',
        status: 'authorization_required',
      });
    }
  }

  // 3. Generic API token — CLI/CI / explicit service identity only (not user CF ops).
  if (wantToken && authMode !== 'oauth') {
    const apiToken = clean(env.CLOUDFLARE_API_TOKEN);
    if (apiToken) {
      return pack({
        bearerToken: apiToken,
        accountId: accountFallback || null,
        source: 'api_token',
        status: 'ready',
      });
    }
  }

  // 4. Capability-specific Images token ONLY for Images family (service identity)
  if (wantToken && authMode !== 'oauth' && capabilityId === 'cloudflare.images') {
    const imagesToken = clean(env.CLOUDFLARE_IMAGES_API_TOKEN || env.CLOUDFLARE_IMAGES_TOKEN);
    if (imagesToken) {
      return pack({
        bearerToken: imagesToken,
        accountId: accountFallback || null,
        source: 'images_api_token',
        status: 'ready',
      });
    }
  }

  // Snippets: OAuth catalog may not expose a scope — mark token_required when no oauth scope known
  if (cap && (!cap.oauthScopes || cap.oauthScopes.length === 0) && cap.tokenRequired) {
    return pack({ status: 'token_required', source: 'missing' });
  }

  return pack({
    status: ownerId ? 'authorization_required' : 'token_required',
  });
}

/** Safe metadata for receipts/status — NEVER includes bearerToken. */
export function credentialSafeMeta(cred) {
  if (!cred) return null;
  return {
    auth_source: cred.source,
    account_id: cred.accountId || null,
    connection_id: cred.connectionId || null,
    granted_scopes_count: (cred.grantedScopes || []).length,
    expires_at: cred.expiresAt || null,
    status: cred.status,
    capability_id: cred.capabilityId || null,
    account_label: cred.accountLabel || null,
  };
}
