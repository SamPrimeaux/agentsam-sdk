/**
 * Cloudflare credential resolution — OAuth connection OR API token.
 *
 * Authority law:
 * - OAuth (user_oauth_tokens, provider=cloudflare) is the Local Studio product path
 * - CLOUDFLARE_API_TOKEN remains valid for CLI / CI / headless
 * - CLOUDFLARE_IMAGES_API_TOKEN is Images-family only — never a generic CF API fallback
 * - agentsam_cloudflare_connections is LEGACY dual-read only; do not expand it
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

/**
 * Load Cloudflare credential from generic user_oauth_tokens (canonical).
 * Decrypt uses connector vault only when ciphertext matches connector packing.
 * Prefer plaintext/encrypted fields already resolved by host identity layer when injected.
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
    accessToken = clean(await options.decryptUserOauthToken(env, row.access_token_encrypted));
  }
  // Do not attempt connector-AAD decrypt against IAM vault ciphertext — formats differ.
  if (!accessToken) return null;

  let accountId = clean(row.account_identifier);
  if (accountId.startsWith('cf_oauth_')) accountId = '';
  if (!accountId && row.metadata_json) {
    try {
      const meta = JSON.parse(row.metadata_json);
      accountId = clean(meta.cloudflare_account_id || meta.account_id);
    } catch {
      /* ignore */
    }
  }

  return {
    bearerToken: accessToken,
    accountId: accountId || null,
    source: 'oauth_connection',
    connectionId: row.id != null ? String(row.id) : null,
    grantedScopes: scopesFromRow(row),
    expiresAt: row.expires_at ? Number(row.expires_at) : null,
    accountLabel: row.account_display || row.account_email || accountId || null,
    provider: 'cloudflare',
  };
}

/**
 * LEGACY: agentsam_cloudflare_connections — dual-read recovery only.
 * Do not add columns or new writers. Canonical store is user_oauth_tokens.
 */
export async function loadCloudflareFromLegacyConnections(env, ownerId, options = {}) {
  if (!env?.DB || !ownerId) return null;
  let row;
  try {
    row = await env.DB.prepare(`
      SELECT connection_id, owner_id, cloudflare_account_id, scopes, status,
             access_token_encrypted, refresh_token_encrypted, expires_at
      FROM agentsam_cloudflare_connections
      WHERE owner_id = ? AND status = 'connected'
      ORDER BY updated_at DESC LIMIT 1
    `).bind(ownerId).first();
  } catch {
    return null;
  }
  if (!row?.access_token_encrypted || row.owner_id !== ownerId) return null;
  if (!vaultConfigured(env)) return null;
  const aad = `cloudflare-connection:${ownerId}`;
  const accessToken = await decryptSecret(env, row.access_token_encrypted, aad);
  return {
    bearerToken: accessToken,
    accountId: row.cloudflare_account_id || null,
    source: 'oauth_connection_legacy',
    connectionId: row.connection_id,
    grantedScopes: row.scopes ? String(row.scopes).split(' ').filter(Boolean) : [],
    expiresAt: Number(row.expires_at || 0) || null,
    accountLabel: row.cloudflare_account_id || null,
    provider: 'cloudflare',
    legacy: true,
  };
}

/**
 * @param {object} opts
 * @param {'auto'|'oauth'|'token'} [opts.authMode]
 * @returns {Promise<{
 *   bearerToken: string|null,
 *   accountId: string|null,
 *   source: 'explicit'|'oauth_connection'|'oauth_connection_legacy'|'api_token'|'images_api_token'|'missing',
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

  // 2. Connected OAuth (canonical user_oauth_tokens, then legacy table)
  if (wantOauth && ownerId) {
    const canonical = await loadCloudflareFromUserOauthTokens(env, ownerId, { decryptUserOauthToken });
    if (canonical?.bearerToken) {
      return pack({
        ...canonical,
        accountId: canonical.accountId || accountFallback || null,
        status: 'ready',
      });
    }
    const legacy = await loadCloudflareFromLegacyConnections(env, ownerId, opts);
    if (legacy?.bearerToken) {
      return pack({
        ...legacy,
        accountId: legacy.accountId || accountFallback || null,
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
    legacy: Boolean(cred.legacy),
  };
}
