import { getCloudflareCapability } from './capabilities.js';
/**
 * Provider scope registry — reads D1 `agentsam_provider_scopes` (the SSOT for
 * which scopes a provider offers) instead of code constants. Code catalogs are
 * only a fallback when D1 is unreachable.
 */
const TTL_MS = 60_000;
const cache = new Map();

export async function loadProviderScopes(env, providerKey = 'cloudflare') {
  if (!env?.DB?.prepare) return null;
  const hit = cache.get(providerKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.scopes;
  try {
    const { results } = await env.DB.prepare(
      'SELECT scope, label, category FROM agentsam_provider_scopes WHERE provider_key = ? AND is_active = 1',
    ).bind(providerKey).all();
    const scopes = new Map((results || []).map((row) => [row.scope, row]));
    if (!scopes.size) return null;
    cache.set(providerKey, { at: Date.now(), scopes });
    return scopes;
  } catch {
    return null;
  }
}

/**
 * Resolve only the scopes explicitly declared for a capability. The previous
 * last-segment prefix match could silently request every permission in an
 * unrelated family. D1 enumerates scope availability; the selected capability
 * or explicit `cloudflare.perm.<family>` authorizes the requested set.
 */
export async function registryScopesForCapability(env, capabilityId, providerKey = 'cloudflare') {
  const registry = await loadProviderScopes(env, providerKey);
  if (!registry) return null;
  const id = String(capabilityId || '');
  if (providerKey !== 'cloudflare') return null;
  const defined = getCloudflareCapability(id);
  if (defined && Array.isArray(defined.oauthScopes) && defined.oauthScopes.length) {
    const scopes = defined.oauthScopes.filter(scope => registry.has(scope));
    return scopes.length ? scopes : null;
  }
  const match = /^cloudflare\.perm\.([a-z0-9][a-z0-9-]*)$/.exec(id);
  if (!match) return null;
  const exactFamily = match[1];
  const scopes = [...registry.keys()].filter(scope => scope.startsWith(exactFamily + '.'));
  return scopes.length ? scopes : null;
}
/** Provider permission inventory for a permission picker. These are offerable,
 * NOT an account's granted token permissions. */
export async function listProviderScopeOptions(env, providerKey = 'cloudflare') {
  const registry = await loadProviderScopes(env, providerKey);
  if (!registry) return null;
  return [...registry.values()].map(row => ({
    scope: row.scope, label: row.label, category: row.category,
  })).sort((a,b) => a.scope.localeCompare(b.scope));
}

/** Drop scopes the registry does not (or no longer) offer. */
export async function filterToRegistry(env, scopes, providerKey = 'cloudflare') {
  const registry = await loadProviderScopes(env, providerKey);
  if (!registry) return scopes;
  return scopes.filter((scope) => scope === 'offline_access' || registry.has(scope));
}

/** Scopes already granted on the active connection; new grants are added on top. */
export async function activeGrantedScopes(env, ownerId, providerKey = 'cloudflare') {
  if (!env?.DB?.prepare || !ownerId) return [];
  try {
    const row = await env.DB.prepare(
      'SELECT scopes FROM user_oauth_tokens WHERE account_id = ? AND provider = ? AND is_active = 1 AND revoked_at IS NULL ORDER BY updated_at DESC LIMIT 1',
    ).bind(ownerId, providerKey).first();
    return String(row?.scopes || '').split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Scopes a plugin pack declares in `agentsam_plugins.config_json`
 * (`oauth_scopes` + `oauth_scopes_edit`), e.g. pack `create` -> plugin `cloudflare-create`.
 * Returns null when no pack row exists so callers can fall back.
 */
export async function pluginPackScopes(env, packs, providerKey = 'cloudflare') {
  if (!env?.DB?.prepare || !packs?.length) return null;
  const requested = new Set(packs.map(pack => String(pack || '').toLowerCase()).filter(Boolean));
  if (!requested.size) return null;
  try {
    // Pack identity comes from the registry's config.pack_id, not a fabricated
    // provider + pack key. The user can install/relabel registered packs.
    const { results } = await env.DB.prepare(
      `SELECT id, plugin_key, config_json FROM agentsam_plugins WHERE provider_key = ? AND plugin_kind = 'oauth'`,
    ).bind(providerKey).all();
    const out = new Set();
    let found = 0;
    for (const row of results || []) {
      let cfg = {};
      try { cfg = JSON.parse(row.config_json || '{}'); } catch { /* invalid plugin config is ignored */ }
      const packId = String(cfg.pack_id || '').toLowerCase();
      if (cfg.pack !== true || !requested.has(packId)) continue;
      found++;
      for (const scope of [...(Array.isArray(cfg.oauth_scopes) ? cfg.oauth_scopes : []),
                            ...(Array.isArray(cfg.oauth_scopes_edit) ? cfg.oauth_scopes_edit : [])]) {
        if (typeof scope === 'string' && scope.trim()) out.add(scope.trim());
      }
    }
    return found ? [...out] : null;
  } catch {
    return null;
  }
}
