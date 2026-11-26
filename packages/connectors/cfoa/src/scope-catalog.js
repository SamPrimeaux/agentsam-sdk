/**
 * Compatibility helpers for callers that need to inspect Cloudflare OAuth
 * scope availability. The scope catalog itself is owned by the plugin config
 * and supplied by the host; this package ships no static scope list.
 */

import { normalizeProviderPermissionCatalog } from './scope-registry.js';

function resolveCatalog(permissionCatalog) {
  if (!permissionCatalog) return null;
  if (permissionCatalog.availableScopes instanceof Set) return permissionCatalog;
  return normalizeProviderPermissionCatalog(permissionCatalog, 'cloudflare');
}

export function listCloudflareScopes(permissionCatalog = null) {
  const catalog = resolveCatalog(permissionCatalog);
  return catalog ? [...catalog.availableScopes].sort() : [];
}

export function isKnownCloudflareScope(scope, permissionCatalog = null) {
  const catalog = resolveCatalog(permissionCatalog);
  return Boolean(catalog && catalog.availableScopes.has(String(scope || '').trim()));
}
