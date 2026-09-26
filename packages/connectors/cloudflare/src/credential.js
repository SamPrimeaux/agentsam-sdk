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
import { getCloudflareCapability } from './capabilities.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function scopesFromRow(row) {
  if (!row) return [];
  if (row.scopes) return String(row.scopes).split(/[\s,]+/).filter(Boolean);
  if (row.scope) return String(row.scope).split(/[\s,]+/).filter(Boolean);
  return [];
}

function accountIdFromRow(row) {
  let accountId = clean(row?.account_identifier);
  if (accountId.startsWith('cf_oauth_')) accountId = '';
  if (!accountId && row?.metadata_json) {
    try {
      const meta = JSON.parse(row.metadata_json);
      accountId = clean(meta.cloudflare_account_id || meta.account_id);
    } catch {
      /* ignore */
    }
  }
  return accountId || null;
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
  return {
    connectionId: row.id != null ? String(row.id) : `uot_${ownerId}`,
    ownerId,
    cloudflareAccountId: accountIdFromRow(row),
    scopes: scopesFromRow(row),
    status: active ? 'connected' : (metaStatus === 'superseded' ? 'superseded' : 'revoked'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

/**
 * Load active Cloudflare connection metadata from user_oauth_tokens (no token decrypt).
 */
export async function loadCloudflareConnectionRecord(env, ownerId) {
  if (!env?.DB || !ownerId) return null;
  let row;
  try {
    row = await env.DB.prepare(`
      SELECT id, user_id, provider, account_identifier, account_display, account_email,
             scope, scopes, expires_at, metadata_json, is_active, revoked_at,
             created_at, updated_at
      FROM user_oauth_tokens
      WHERE user_id = ? AND LOWER(provider) = 'cloudflare'
        AND COALESCE(is_active, 1) = 1
        AND (revoked_at IS NULL OR revoked_at = 0)
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(ownerId).first();
  } catch {
    return null;
  }
  return mapCloudflareOauthRowToConnection(row, ownerId);
}

/**
 * Load Cloudflare credential from user_oauth_tokens (SSOT).
 * Decrypt order: plaintext → host decryptUserOauthToken → connector vault AAD.
 */
export async function loadCloudflareFromUserOauthTokens(env, ownerId, options = {}) {
  if (!env?.DB || !ownerId) return null;
  let row;
  try {
    row = await env.DB.prepare(`
      SELECT id, user_id, provider, account_identifier, account_display, account_email,
             access_token, refresh_token, access_token_encrypted, refresh_token_encrypted,
             scope, scopes, expires_at, metadata_json, is_active
      FROM user_oauth_tokens
      WHERE user_id = ? AND LOWER(provider) = 'cloudflare'
        AND COALESCE(is_active, 1) = 1
        AND (revoked_at IS NULL OR revoked_at = 0)
      ORDER BY updated_at DESC
      LIMIT 1
    `).bind(ownerId).first();
  } catch {
    // Table may not exist on SDK-only D1 fixtures
    return null;
  }
  if (!row) return null;

  let accessToken = clean(row.access_token);
  if (!accessToken && row.access_token_encrypted && options.decryptUserOauthToken) {
    try {
      accessToken = clean(await options.decryptUserOauthToken(env, row.access_token_encrypted));
    } catch {
      /* host vault packing may differ — fall through to connector AAD */
    }
  }
  if (!accessToken && row.access_token_encrypted && vaultConfigured(env)) {
    try {
      accessToken = clean(await decryptSecret(env, row.access_token_encrypted, `cloudflare-connection:${ownerId}`));
    } catch {
      /* IAM vault ciphertext is not connector-AAD — leave null */
    }
  }
  if (!accessToken) return null;

  const accountId = accountIdFromRow(row);

  return {
    bearerToken: accessToken,
    accountId,
    source: 'oauth_connection',
    connectionId: row.id != null ? String(row.id) : null,
    grantedScopes: scopesFromRow(row),
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
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

  const accountFallback = clean(explicitAccountId || env.CLOUDFLARE_ACCOUNT_ID);
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
    const canonical = await loadCloudflareFromUserOauthTokens(env, ownerId, { decryptUserOauthToken });
    if (canonical?.bearerToken) {
      return pack({
        ...canonical,
        accountId: canonical.accountId || accountFallback || null,
        status: 'ready',
      });
    }
    if (authMode === 'oauth') {
      return pack({
        source: 'missing',
        status: 'authorization_required',
      });
    }
  }

  // 3. Generic API token
  if (wantToken) {
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

  // 4. Capability-specific Images token ONLY for Images family
  if (wantToken && capabilityId === 'cloudflare.images') {
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
