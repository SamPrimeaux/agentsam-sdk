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

/** `cloudflare.images` -> every active registry scope in the `images.*` family. */
export async function registryScopesForCapability(env, capabilityId, providerKey = 'cloudflare') {
  const registry = await loadProviderScopes(env, providerKey);
  if (!registry) return null;
  const family = String(capabilityId || '').split('.').pop();
  if (!family) return null;
  const found = [...registry.keys()].filter((scope) => scope.startsWith(`${family}.`));
  return found.length ? found : null;
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
