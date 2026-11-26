/**
 * Provider OAuth permission catalog contract.
 *
 * This module deliberately knows nothing about D1, agentsam_plugins, config_json,
 * or any host persistence schema. A host injects a permissionRegistry adapter
 * that returns this normalized contract for a provider.
 */

function strings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
}

function normalizePermissions(values) {
  const rows = new Map();
  for (const item of Array.isArray(values) ? values : []) {
    const row = typeof item === 'string' ? { scope: item } : item;
    const scope = String(row?.scope || '').trim();
    if (!scope) continue;
    rows.set(scope, {
      scope,
      label: String(row.label || scope),
      category: String(row.category || 'provider'),
    });
  }
  return [...rows.values()].sort((a, b) => a.scope.localeCompare(b.scope));
}

/** Convert a host-owned catalog to the stable connector contract. */
export function normalizeProviderPermissionCatalog(input, providerKey = 'cloudflare') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const packs = (Array.isArray(input.packs) ? input.packs : [])
    .map((pack) => {
      const id = String(pack?.id || '').trim().toLowerCase();
      if (!id) return null;
      return {
        id,
        label: String(pack.label || id),
        description: String(pack.description || ''),
        scopes: strings(pack.scopes),
        capabilities: strings(pack.capabilities),
      };
    })
    .filter(Boolean);
  const capabilities = (Array.isArray(input.capabilities) ? input.capabilities : [])
    .map((capability) => {
      const id = String(capability?.id || '').trim();
      if (!id) return null;
      return {
        id,
        label: String(capability.label || id),
        scopes: strings(capability.scopes),
      };
    })
    .filter(Boolean);
  const aliases = {};
  if (input.aliases && typeof input.aliases === 'object' && !Array.isArray(input.aliases)) {
    for (const [key, value] of Object.entries(input.aliases)) {
      const id = String(key || '').trim().toLowerCase();
      if (id) aliases[id] = strings(value).map((item) => item.toLowerCase());
    }
  }
  const baselineScopes = strings(input.baselineScopes ?? input.baseline_scopes);
  const defaultPacks = strings(input.defaultPacks ?? input.default_packs).map((id) => id.toLowerCase());
  const available = normalizePermissions(input.availablePermissions ?? input.available_permissions);
  const allScopes = new Set([
    ...baselineScopes,
    ...packs.flatMap((pack) => pack.scopes),
    ...capabilities.flatMap((capability) => capability.scopes),
    ...available.map((row) => row.scope),
  ]);
  const permissionRows = new Map(available.map((row) => [row.scope, row]));
  for (const scope of allScopes) {
    if (!permissionRows.has(scope)) permissionRows.set(scope, {
      scope,
      label: scope,
      category: 'provider',
    });
  }
  return {
    providerKey: String(input.providerKey || input.provider_key || providerKey),
    pluginId: input.pluginId || input.plugin_id || null,
    pluginKey: input.pluginKey || input.plugin_key || null,
    baselineScopes,
    defaultPacks,
    aliases,
    allowFullCatalogOptIn: input.allowFullCatalogOptIn === true || input.allow_full_catalog_opt_in === true,
    packs,
    capabilities,
    availablePermissions: [...permissionRows.values()].sort((a, b) => a.scope.localeCompare(b.scope)),
    availableScopes: allScopes,
  };
}

/**
 * Load a catalog through a host adapter. Supported adapter shape:
 * { getOAuthPermissionCatalog(providerKey): Promise<catalog|null> }
 * or a function with the same signature.
 */
export async function loadProviderPermissionCatalog(permissionRegistry, providerKey = 'cloudflare') {
  if (!permissionRegistry) return null;
  const loader = typeof permissionRegistry === 'function'
    ? permissionRegistry
    : permissionRegistry.getOAuthPermissionCatalog;
  if (typeof loader !== 'function') return null;
  try {
    const input = await loader.call(permissionRegistry, providerKey);
    const catalog = normalizeProviderPermissionCatalog(input, providerKey);
    if (!catalog || catalog.providerKey.toLowerCase() !== String(providerKey).trim().toLowerCase()) return null;
    return catalog;
  } catch {
    return null;
  }
}

function expandPackIds(catalog, requestedPacks) {
  const known = new Set(catalog.packs.map((pack) => pack.id));
  const expanded = new Set();
  const visiting = new Set();
  const unknown = new Set();
  const visit = (raw) => {
    const id = String(raw || '').trim().toLowerCase();
    if (!id) return;
    if (visiting.has(id)) {
      unknown.add(id);
      return;
    }
    if (known.has(id)) {
      expanded.add(id);
      return;
    }
    const alias = catalog.aliases[id];
    if (!alias) {
      unknown.add(id);
      return;
    }
    visiting.add(id);
    for (const target of alias) visit(target);
    visiting.delete(id);
  };
  for (const id of requestedPacks) visit(id);
  return { packs: [...expanded], unknown: [...unknown] };
}

/** Resolve requested pack/capability IDs into registered OAuth scopes only. */
export function resolvePermissionScopes(catalog, { packs = [], capabilities = [] } = {}) {
  if (!catalog) return { ok: false, error: 'cloudflare_permission_registry_unavailable' };
  const requestedPacks = strings(packs).map((id) => id.toLowerCase());
  const requestedCapabilities = strings(capabilities);
  if (requestedPacks.includes('all')) {
    if (!catalog.allowFullCatalogOptIn) {
      return { ok: false, error: 'cloudflare_permission_pack_unavailable', unknown_packs: ['all'] };
    }
    if (requestedPacks.length !== 1 || requestedCapabilities.length) {
      return { ok: false, error: 'cloudflare_full_catalog_opt_in_must_be_exclusive' };
    }
    return {
      ok: true,
      scopes: [...catalog.availableScopes],
      packs: ['all'],
      capabilities: catalog.capabilities.map((capability) => capability.id),
    };
  }
  const effectivePacks = requestedPacks.length ? requestedPacks : (requestedCapabilities.length ? [] : catalog.defaultPacks);
  const expanded = expandPackIds(catalog, effectivePacks);
  if (expanded.unknown.length) {
    return { ok: false, error: 'cloudflare_permission_pack_unavailable', unknown_packs: expanded.unknown };
  }
  const capabilityMap = new Map(catalog.capabilities.map((capability) => [capability.id, capability]));
  const unknownPackCapabilities = expanded.packs
    .flatMap((id) => (catalog.packs.find((pack) => pack.id === id)?.capabilities || []))
    .filter((id) => !capabilityMap.has(id));
  if (unknownPackCapabilities.length) {
    return {
      ok: false,
      error: 'cloudflare_permission_pack_capability_unavailable',
      unknown_capabilities: [...new Set(unknownPackCapabilities)],
    };
  }
  const unknownCapabilities = requestedCapabilities.filter((id) => !capabilityMap.has(id));
  if (unknownCapabilities.length) {
    return { ok: false, error: 'cloudflare_capability_unavailable', unknown_capabilities: unknownCapabilities };
  }
  const scopes = new Set(catalog.baselineScopes);
  const resolvedCapabilities = new Set(requestedCapabilities);
  const packMap = new Map(catalog.packs.map((pack) => [pack.id, pack]));
  for (const id of expanded.packs) {
    const pack = packMap.get(id);
    for (const scope of pack?.scopes || []) scopes.add(scope);
    for (const capability of pack?.capabilities || []) resolvedCapabilities.add(capability);
  }
  for (const id of requestedCapabilities) {
    for (const scope of capabilityMap.get(id)?.scopes || []) scopes.add(scope);
  }
  return {
    ok: true,
    scopes: [...scopes],
    packs: expanded.packs,
    capabilities: [...resolvedCapabilities],
  };
}

/** Provider permission inventory for a picker; these are offerable, not granted. */
export function listProviderScopeOptions(catalog) {
  if (!catalog) return null;
  return catalog.availablePermissions;
}

/** Restrict newly requested scopes to those declared by the injected catalog. */
export function filterToRegistry(scopes, catalog) {
  if (!catalog) return null;
  return strings(scopes).filter((scope) => catalog.availableScopes.has(scope));
}

/** Scopes already granted on the active connection; additions stay on that account. */
export async function activeGrantedScopes(env, ownerId, providerKey = 'cloudflare', accountIdentifier = '') {
  if (!env?.DB?.prepare || !ownerId || !accountIdentifier) return [];
  try {
    const row = await env.DB.prepare(
      'SELECT scopes FROM user_oauth_tokens WHERE account_id = ? AND provider = ? ' +
      'AND account_identifier = ? AND is_active = 1 AND revoked_at IS NULL LIMIT 1',
    ).bind(ownerId, providerKey, accountIdentifier).first();
    return String(row?.scopes || '').split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}
