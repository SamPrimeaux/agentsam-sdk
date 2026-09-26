/**
 * Canonical Cloudflare connection writer → user_oauth_tokens.
 *
 * One row per (user_id, provider=cloudflare, account_identifier).
 * Scopes are merged as a union on every write so concurrent grants from
 * different Cloudflare OAuth clients cannot silently downgrade each other.
 * Provenance is the real OAuth client_id only — no invented app-name enum.
 */

const PROVIDER = 'cloudflare';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function splitScopes(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(/[\s,]+/).filter(Boolean);
}

/** @param {string[]} a @param {string[]} b */
export function unionScopes(a = [], b = []) {
  return [...new Set([...splitScopes(a), ...splitScopes(b)])];
}

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Resolve Cloudflare account id from token via /v4/accounts (best-effort).
 * @param {string} accessToken
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function resolveCloudflareAccountId(accessToken, opts = {}) {
  const token = clean(accessToken);
  if (!token) return null;
  const fetchImpl = opts.fetchImpl || fetch;
  try {
    const res = await fetchImpl('https://api.cloudflare.com/client/v4/accounts?per_page=1', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const account = body?.result?.[0];
    const id = clean(account?.id);
    if (!/^[a-f0-9]{32}$/i.test(id)) return null;
    return { id, name: clean(account?.name) || null };
  } catch {
    return null;
  }
}

/**
 * Upsert Cloudflare grant into user_oauth_tokens with scope union + client_id provenance.
 * Metadata merge failures are non-fatal; token write errors are returned.
 *
 * @param {object} env
 * @param {object} input
 * @param {string} input.userId
 * @param {string} input.accessToken
 * @param {string} [input.refreshToken]
 * @param {string|string[]} [input.scopes]
 * @param {string} [input.accountId]
 * @param {string} [input.accountDisplay]
 * @param {number|null} [input.expiresAt]
 * @param {string} [input.clientId] — real Cloudflare OAuth client_id used for this grant
 * @param {string[]} [input.capabilitySet]
 */
export async function upsertCloudflareUserOauthToken(env, input = {}) {
  if (!env?.DB?.prepare) {
    return { ok: false, error: 'db_unavailable' };
  }
  const userId = clean(input.userId);
  const accessToken = clean(input.accessToken);
  if (!userId || !accessToken) {
    return { ok: false, error: 'user_id_and_access_token_required' };
  }

  let accountId = clean(input.accountId);
  let accountDisplay = clean(input.accountDisplay) || null;
  if (!accountId) {
    const resolved = await resolveCloudflareAccountId(accessToken);
    if (resolved?.id) {
      accountId = resolved.id;
      accountDisplay = accountDisplay || resolved.name || null;
    }
  }
  if (!accountId) accountId = `cf_oauth_${userId}`;

  const now = Math.floor(Date.now() / 1000);
  const incomingScopes = splitScopes(input.scopes);
  let existing = null;
  try {
    existing = await env.DB.prepare(
      `SELECT scopes, scope, metadata_json, access_token, refresh_token,
              access_token_encrypted, refresh_token_encrypted
       FROM user_oauth_tokens
       WHERE user_id = ? AND LOWER(provider) = ? AND account_identifier = ?
       LIMIT 1`,
    ).bind(userId, PROVIDER, accountId).first();
  } catch (err) {
    return { ok: false, error: 'user_oauth_tokens_unavailable', detail: String(err?.message || err) };
  }

  const priorScopes = splitScopes(existing?.scopes || existing?.scope);
  const mergedScopes = unionScopes(priorScopes, incomingScopes);
  const scopesStr = mergedScopes.join(' ') || null;

  const priorMeta = parseMeta(existing?.metadata_json);
  const clientId = clean(input.clientId) || clean(priorMeta.connected_via_client_id) || null;
  const capabilitySet = Array.isArray(input.capabilitySet)
    ? input.capabilitySet
    : (Array.isArray(priorMeta.granted_at_capability_set) ? priorMeta.granted_at_capability_set : []);

  let metadataJson = null;
  try {
    // Provenance = real Cloudflare OAuth client_id only. No invented app-name enum.
    const next = {
      ...priorMeta,
      cloudflare_account_id: accountId,
      last_connected_at: now,
    };
    if (clientId) next.connected_via_client_id = clientId;
    if (capabilitySet.length) next.granted_at_capability_set = capabilitySet;
    // Drop any previously invented connected_via_app field if present.
    delete next.connected_via_app;
    metadataJson = JSON.stringify(next);
  } catch {
    metadataJson = JSON.stringify({
      cloudflare_account_id: accountId,
      ...(clientId ? { connected_via_client_id: clientId } : {}),
    });
  }

  const expiresAt = input.expiresAt != null ? Number(input.expiresAt) : null;
  const refreshToken = clean(input.refreshToken) || clean(existing?.refresh_token) || null;

  try {
    await env.DB.prepare(
      `INSERT INTO user_oauth_tokens (
         user_id, tenant_id, person_uuid, provider, account_identifier,
         access_token, refresh_token, scope, scopes, expires_at,
         account_display, metadata_json, is_active, created_at, updated_at,
         revoked_at, refresh_failure_count
       ) VALUES (?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 0)
       ON CONFLICT(user_id, provider, account_identifier) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, user_oauth_tokens.refresh_token),
         scope = excluded.scope,
         scopes = excluded.scopes,
         expires_at = excluded.expires_at,
         account_display = COALESCE(excluded.account_display, user_oauth_tokens.account_display),
         metadata_json = excluded.metadata_json,
         is_active = 1,
         revoked_at = NULL,
         updated_at = excluded.updated_at`,
    ).bind(
      userId,
      PROVIDER,
      accountId,
      accessToken,
      refreshToken,
      scopesStr,
      scopesStr,
      expiresAt,
      accountDisplay,
      metadataJson,
      now,
      now,
    ).run();
  } catch (err) {
    try {
      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_oauth_tokens (
           user_id, tenant_id, person_uuid, provider, account_identifier,
           access_token, refresh_token, scope, scopes, expires_at,
           account_display, metadata_json, is_active, created_at, updated_at
         ) VALUES (?, '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        userId,
        PROVIDER,
        accountId,
        accessToken,
        refreshToken,
        scopesStr,
        scopesStr,
        expiresAt,
        accountDisplay,
        metadataJson,
        existing ? Number(existing.created_at) || now : now,
        now,
      ).run();
    } catch (err2) {
      return { ok: false, error: 'upsert_failed', detail: String(err2?.message || err2 || err?.message || err) };
    }
  }

  return {
    ok: true,
    accountId,
    scopes: mergedScopes,
    scope_union: true,
    provenance: {
      connected_via_client_id: clientId,
      granted_at_capability_set: capabilitySet,
    },
  };
}
