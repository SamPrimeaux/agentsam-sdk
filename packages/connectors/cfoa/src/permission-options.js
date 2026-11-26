/**
 * Provider permission option helpers.
 *
 * The permission rows are supplied by the owning plugin's OAuth catalog.
 * This module contains presentation/grouping logic only; it owns no scope
 * identifiers, product scope lists, or consent-pack definitions.
 */

export const CLOUDFLARE_PERMISSION_CATEGORY_LABELS = Object.freeze({
  developer_platform: 'Developer Platform',
  ai: 'AI & Machine Learning',
  dns_zones: 'DNS & Zones',
  app_security: 'App Security',
  rules: 'Rules & Configuration',
  zero_trust: 'Cloudflare One / Zero Trust',
  analytics: 'Analytics & Logs',
  network: 'Network Services',
  media: 'Media',
  email: 'Email & Messaging',
  cache: 'Cache & Performance',
  account: 'Account & Billing',
  other: 'Other',
});

const CATEGORY_ALIASES = Object.freeze({
  'account-billing': 'account',
  'ai-machine-learning': 'ai',
  'analytics-logs': 'analytics',
  'app-security': 'app_security',
  'cache-performance': 'cache',
  'cloudflare-one-zero-trust': 'zero_trust',
  'developer-platform': 'developer_platform',
  'dns-zones': 'dns_zones',
  'email-messaging': 'email',
  'media': 'media',
  'network-services': 'network',
  'other': 'other',
  'rules-configuration': 'rules',
});

const WORD_LABELS = Object.freeze({
  agw: 'AGW',
  ai: 'AI',
  api: 'API',
  cf: 'CF',
  d1: 'D1',
  ddos: 'DDoS',
  dns: 'DNS',
  idp: 'IdP',
  ip: 'IP',
  jwt: 'JWT',
  k2: 'K2',
  kv: 'KV',
  mcp: 'MCP',
  moq: 'MoQ',
  r2: 'R2',
  saml: 'SAML',
  scim: 'SCIM',
  sql: 'SQL',
  ssl: 'SSL',
  sso: 'SSO',
  tls: 'TLS',
  url: 'URL',
  waf: 'WAF',
  wasm: 'WASM',
  warp: 'WARP',
});

function availablePermissions(permissionCatalog) {
  const rows = permissionCatalog?.availablePermissions ?? permissionCatalog?.available_permissions;
  return Array.isArray(rows) ? rows : [];
}

function normalizeCategory(value) {
  const category = String(value || '').trim().toLowerCase();
  if (CATEGORY_ALIASES[category]) return CATEGORY_ALIASES[category];
  if (Object.hasOwn(CLOUDFLARE_PERMISSION_CATEGORY_LABELS, category)) return category;
  return 'other';
}

function productKeyForScope(scope) {
  const value = String(scope || '').trim();
  const separator = value.indexOf('.');
  return separator > 0 ? value.slice(0, separator) : value;
}

function humanizeProductKey(key) {
  return String(key || '')
    .split('-')
    .filter(Boolean)
    .map((word) => WORD_LABELS[word.toLowerCase()] || (word[0]?.toUpperCase() + word.slice(1)))
    .join(' ');
}

/**
 * Derive selectable permission products from the plugin-owned permission rows.
 * Product identity is the scope prefix before the final action segment.
 */
export function listCloudflarePermissionProducts(permissionCatalog = null) {
  const groups = new Map();
  for (const permission of availablePermissions(permissionCatalog)) {
    const scope = String(permission?.scope || '').trim();
    if (!scope) continue;
    const key = productKeyForScope(scope);
    if (!key) continue;
    const category = normalizeCategory(permission?.category);
    let product = groups.get(key);
    if (!product) {
      product = {
        id: `cloudflare.perm.${key}`,
        category,
        label: humanizeProductKey(key),
        oauthScopes: [],
      };
      groups.set(key, product);
    } else if (product.category === 'other' && category !== 'other') {
      product.category = category;
    }
    product.oauthScopes.push(scope);
  }
  return [...groups.values()]
    .map((product) => ({
      ...product,
      oauthScopes: [...new Set(product.oauthScopes)].sort(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function listCloudflarePermissionOptionsByCategory(permissionCatalog = null) {
  const out = {};
  for (const product of listCloudflarePermissionProducts(permissionCatalog)) {
    const category = product.category || 'other';
    if (!out[category]) out[category] = [];
    out[category].push(product);
  }
  return out;
}

/** Capability ids for fine-grained provider permission products in the host catalog. */
export function permissionProductsAsCapabilities(permissionCatalog = null) {
  const capabilities = {};
  for (const product of listCloudflarePermissionProducts(permissionCatalog)) {
    const categoryLabel = CLOUDFLARE_PERMISSION_CATEGORY_LABELS[product.category] || product.category;
    capabilities[product.id] = {
      id: product.id,
      domain: product.category,
      label: product.label,
      oauthScopes: [...product.oauthScopes],
      permissionLabel: `Cloudflare → ${categoryLabel} → ${product.label}`,
      availability: 'generally_available',
    };
  }
  return capabilities;
}

/** Validate that every host-offered permission is represented by a derived product. */
export function assertPermissionCatalogCoversAllScopes(permissionCatalog = null) {
  const offered = new Set(
    availablePermissions(permissionCatalog)
      .map((permission) => String(permission?.scope || '').trim())
      .filter(Boolean),
  );
  const products = listCloudflarePermissionProducts(permissionCatalog);
  const covered = new Set(products.flatMap((product) => product.oauthScopes));
  const missing = [...offered].filter((scope) => !covered.has(scope)).sort();
  return {
    ok: missing.length === 0,
    scopes: offered.size,
    products: products.length,
    covered: covered.size,
    missing,
  };
}
