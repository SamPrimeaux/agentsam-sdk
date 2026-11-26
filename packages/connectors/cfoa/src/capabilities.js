/**
 * Cloudflare API capability metadata and operation-level authorization rules.
 *
 * OAuth scopes, permission products, and grant profiles are supplied by the
 * owning plugin's host-injected permission catalog. This module contains
 * operation metadata only; it does not define provider scope identifiers.
 */

import { permissionProductsAsCapabilities } from './permission-options.js';
import { normalizeProviderPermissionCatalog } from './scope-registry.js';

/**
 * @typedef {object} CloudflareCapability
 * @property {string} id
 * @property {string} domain
 * @property {string} label
 * @property {string[]} oauthScopes — resolved from the host permission catalog
 * @property {string} permissionLabel — human dashboard path
 * @property {'generally_available'|'enterprise'|'enterprise_addon'|'subscription'} availability
 * @property {string} [availabilityNote]
 * @property {boolean} [zoneScoped]
 * @property {boolean} [tokenRequired]
 */

/** @type {Record<string, CloudflareCapability>} */
const CLOUDFLARE_CAPABILITIES_CURATED = {
  'cloudflare.workers': {
    id: 'cloudflare.workers',
    domain: 'compute',
    label: 'Workers',
    permissionLabel: 'Account → Workers Scripts → Edit',
    availability: 'generally_available',
  },
  'cloudflare.d1': {
    id: 'cloudflare.d1',
    domain: 'data',
    label: 'D1',
    permissionLabel: 'Account → D1 → Edit',
    availability: 'generally_available',
  },
  'cloudflare.r2': {
    id: 'cloudflare.r2',
    domain: 'data',
    label: 'R2',
    permissionLabel: 'Account → Workers R2 Storage → Edit',
    availability: 'generally_available',
  },
  'cloudflare.images': {
    id: 'cloudflare.images',
    domain: 'data',
    label: 'Images',
    // From Local Studio OAuth scope catalog (Media → Images)
    permissionLabel: 'Account → Cloudflare Images → Edit',
    availability: 'generally_available',
    capabilitySpecificTokenEnv: ['CLOUDFLARE_IMAGES_API_TOKEN'],
  },
  'cloudflare.stream': {
    id: 'cloudflare.stream',
    domain: 'data',
    label: 'Stream',
    permissionLabel: 'Account → Stream → Edit',
    availability: 'generally_available',
  },
  'cloudflare.vectorize': {
    id: 'cloudflare.vectorize',
    domain: 'data',
    label: 'Vectorize',
    permissionLabel: 'Account → Vectorize → Edit',
    availability: 'generally_available',
  },
  'cloudflare.mcp_portals': {
    id: 'cloudflare.mcp_portals',
    domain: 'compute',
    label: 'MCP Portals',
    permissionLabel: 'Account → MCP Portals → Edit',
    availability: 'generally_available',
  },
  'cloudflare.agents': {
    id: 'cloudflare.agents',
    domain: 'compute',
    label: 'Agents',
    permissionLabel: 'Account → Agents → Edit',
    availability: 'generally_available',
  },
  'cloudflare.pages': {
    id: 'cloudflare.pages',
    domain: 'web',
    label: 'Pages',
    permissionLabel: 'Account → Pages → Edit',
    availability: 'generally_available',
  },
  'cloudflare.snippets': {
    id: 'cloudflare.snippets',
    domain: 'web',
    label: 'Snippets',
    // Do NOT invent an OAuth scope string. API permission is Snippets Read/Write.
    // Until catalog exposes a verified identifier, treat as token_required for OAuth-only.
    tokenRequired: true,
    permissionLabel: 'Zone → Snippets → Edit (API: Snippets Read/Write)',
    availability: 'generally_available',
    availabilityNote: 'Pro/Business/Enterprise. Proxied DNS. 5ms CPU / 2MB / 32KB package limits.',
    zoneScoped: true,
  },
  'cloudflare.queues': {
    id: 'cloudflare.queues',
    domain: 'compute',
    label: 'Queues',
    permissionLabel: 'Account → Queues → Edit',
    availability: 'generally_available',
  },
  'cloudflare.flags': {
    id: 'cloudflare.flags',
    domain: 'product',
    label: 'Flagship',
    permissionLabel: 'Account → Flagship → Edit',
    availability: 'generally_available',
  },
  'cloudflare.hyperdrive': {
    id: 'cloudflare.hyperdrive',
    domain: 'data',
    label: 'Hyperdrive',
    permissionLabel: 'Account → Hyperdrive → Edit',
    availability: 'generally_available',
  },
  'cloudflare.email.sending': {
    id: 'cloudflare.email.sending',
    domain: 'email',
    label: 'Email Sending',
    permissionLabel: 'Account → Email Sending → Edit',
    availability: 'generally_available',
  },
  'cloudflare.email.routing': {
    id: 'cloudflare.email.routing',
    domain: 'email',
    label: 'Email Routing',
    permissionLabel: 'Account / Zone → Email Routing',
    availability: 'generally_available',
    zoneScoped: true,
  },
  'cloudflare.email.security': {
    id: 'cloudflare.email.security',
    domain: 'email',
    label: 'Email Security',
    permissionLabel: 'Account → Email Security',
    availability: 'generally_available',
  },
  'cloudflare.workflows': {
    id: 'cloudflare.workflows',
    domain: 'compute',
    label: 'Workflows',
    permissionLabel: 'Account → Workers Scripts → Edit (Workflows)',
    availability: 'generally_available',
    availabilityNote: 'Durable multi-step executions; Free and Paid.',
  },
  'cloudflare.url_scanner': {
    id: 'cloudflare.url_scanner',
    domain: 'security',
    label: 'URL Scanner',
    permissionLabel: 'Account → URL Scanner → Edit',
    availability: 'generally_available',
  },
  'cloudflare.resource_tags': {
    id: 'cloudflare.resource_tags',
    domain: 'organization',
    label: 'Resource Tags',
    permissionLabel: 'Account → Resource Tagging',
    availability: 'enterprise',
    availabilityNote: 'Account resource tagging API is Enterprise (beta).',
  },
  'cloudflare.tag_gateway': {
    id: 'cloudflare.tag_gateway',
    domain: 'web',
    label: 'Google Tag Gateway',
    permissionLabel: 'Zone → Zaraz / Google Tag Gateway (Zaraz Edit)',
    availability: 'generally_available',
    availabilityNote: 'Free. Zone-level. Requires Zaraz Admin / Domain Administrator for dashboard.',
    zoneScoped: true,
  },
  'cloudflare.brand_protection': {
    id: 'cloudflare.brand_protection',
    domain: 'security',
    label: 'Brand Protection',
    permissionLabel: 'Cloudforce One → Brand Protection',
    availability: 'subscription',
    availabilityNote: 'Requires Cloudforce One / Brand Protection subscription.',
  },
  'cloudflare.keyless_ssl': {
    id: 'cloudflare.keyless_ssl',
    domain: 'tls',
    label: 'Keyless SSL',
    permissionLabel: 'Zone → SSL and Certificates → Edit',
    availability: 'enterprise_addon',
    availabilityNote: 'Enterprise add-on. TLS private key stays on customer key server/HSM. TLS 1.3 unsupported for Keyless.',
    zoneScoped: true,
  },
  'cloudflare.token_validation': {
    id: 'cloudflare.token_validation',
    domain: 'security',
    label: 'Token Validation (JWT)',
    permissionLabel: 'Zone → API Gateway / Token Validation',
    availability: 'generally_available',
    zoneScoped: true,
  },
  'cloudflare.tunnels': {
    id: 'cloudflare.tunnels',
    domain: 'web',
    label: 'Tunnel',
    permissionLabel: 'Account → Cloudflare Tunnel',
    availability: 'generally_available',
  },
  'cloudflare.workers_ai': {
    id: 'cloudflare.workers_ai',
    domain: 'ai',
    label: 'Workers AI',
    permissionLabel: 'Account → Workers AI → Edit',
    availability: 'generally_available',
  },
  'cloudflare.ai_search': {
    id: 'cloudflare.ai_search',
    domain: 'ai',
    label: 'AI Search',
    permissionLabel: 'Account → AI Search',
    availability: 'generally_available',
  },
  'cloudflare.containers': {
    id: 'cloudflare.containers',
    domain: 'compute',
    label: 'Workers Containers',
    permissionLabel: 'Account → Workers Containers',
    availability: 'generally_available',
  },
  'cloudflare.secrets_store': {
    id: 'cloudflare.secrets_store',
    domain: 'security',
    label: 'Secrets Store',
    permissionLabel: 'Account → Secrets Store',
    availability: 'generally_available',
  },
  'cloudflare.browser_rendering': {
    id: 'cloudflare.browser_rendering',
    domain: 'compute',
    label: 'Browser Rendering',
    permissionLabel: 'Account → Browser Rendering',
    availability: 'generally_available',
  },
  'cloudflare.basin.read': {
    id: 'cloudflare.basin.read',
    domain: 'data',
    label: 'Basin Analytics (read-only)',
    permissionLabel: 'Account → Pipelines, R2 Catalog and R2 Catalog SQL → Read',
    availability: 'generally_available',
  },
  'cloudflare.pipelines': {
    id: 'cloudflare.pipelines',
    domain: 'data',
    label: 'Pipelines',
    permissionLabel: 'Account → Pipelines',
    availability: 'generally_available',
  },
  'cloudflare.kv': {
    id: 'cloudflare.kv',
    domain: 'data',
    label: 'Workers KV',
    permissionLabel: 'Account → Workers KV Storage',
    availability: 'generally_available',
  },
};

/**
 * Compatibility metadata export. OAuth scope arrays are deliberately empty
 * here; use getCloudflareCapability(id, permissionCatalog) for resolved grants.
 */
export const CLOUDFLARE_CAPABILITIES = Object.freeze(
  Object.fromEntries(
    Object.entries(CLOUDFLARE_CAPABILITIES_CURATED).map(([id, capability]) => [
      id,
      { ...capability, oauthScopes: [] },
    ]),
  ),
);

/** Legacy feature → capability mapping. Scope strings come from the plugin catalog. */
export const CLOUDFLARE_CAPABILITY_SCOPES = Object.freeze({
  workers_deploy: {
    why: 'Deploy Workers for the connected account (Workers Scripts Edit).',
    capability_id: 'cloudflare.workers',
  },
  d1_inspect: {
    why: 'Inspect D1 databases bound to the deployable.',
    capability_id: 'cloudflare.d1',
  },
  r2_inspect: {
    why: 'Inspect R2 buckets bound to the deployable.',
    capability_id: 'cloudflare.r2',
  },
  worker_logs: {
    why: 'Read Worker script metadata/logs for postdeploy health.',
    capability_id: 'cloudflare.workers',
  },
});

function resolveCatalog(input) {
  if (!input) return null;
  if (input.availableScopes instanceof Set && Array.isArray(input.capabilities)) return input;
  return normalizeProviderPermissionCatalog(input, 'cloudflare');
}

function capabilityFromCatalog(id, catalog) {
  const metadata = CLOUDFLARE_CAPABILITIES_CURATED[id] || null;
  const registered = catalog?.capabilities?.find((capability) => capability.id === id) || null;
  const product = permissionProductsAsCapabilities(catalog)[id] || null;
  if (!metadata && !registered && !product) return null;

  const label = metadata?.label || registered?.label || product?.label || id;
  const scopes = registered?.scopes || product?.oauthScopes || [];
  return {
    ...(metadata || {}),
    ...(product || {}),
    id,
    domain: metadata?.domain || registered?.domain || product?.domain || 'cloudflare',
    label,
    oauthScopes: [...new Set(Array.isArray(scopes) ? scopes : [])],
    permissionLabel: metadata?.permissionLabel
      || product?.permissionLabel
      || (registered ? `Cloudflare → ${label}` : null),
    availability: metadata?.availability || 'generally_available',
  };
}

export function listCloudflareCapabilities(permissionCatalog = null) {
  const catalog = resolveCatalog(permissionCatalog);
  const productCapabilities = permissionProductsAsCapabilities(catalog);
  const ids = new Set([
    ...Object.keys(CLOUDFLARE_CAPABILITIES_CURATED),
    ...(catalog?.capabilities || []).map((capability) => capability.id),
    ...Object.keys(productCapabilities),
  ]);
  return [...ids]
    .map((id) => capabilityFromCatalog(id, catalog))
    .filter(Boolean);
}

export function getCloudflareCapability(id, permissionCatalog = null) {
  return capabilityFromCatalog(id, resolveCatalog(permissionCatalog));
}

/**
 * Resolve scopes for selected operation capabilities from the plugin-owned
 * permission catalog. Without a catalog, no OAuth scopes are inferred.
 *
 * @param {{ capabilities?: string[], includeBaseline?: boolean, generallyAvailableOnly?: boolean, permissionCatalog?: object }} [opts]
 */
export function scopesForCapabilities(opts = {}) {
  const catalog = resolveCatalog(opts.permissionCatalog);
  if (!catalog) return [];
  const includeBaseline = opts.includeBaseline !== false;
  const gaOnly = opts.generallyAvailableOnly !== false;
  const ids = Array.isArray(opts.capabilities) ? opts.capabilities : [];
  const scopes = new Set(includeBaseline ? catalog.baselineScopes : []);
  for (const id of ids) {
    const capability = capabilityFromCatalog(id, catalog);
    if (!capability) continue;
    if (gaOnly && capability.availability !== 'generally_available') continue;
    for (const scope of capability.oauthScopes || []) scopes.add(scope);
  }
  return [...scopes];
}

/**
 * Compare granted scopes to a capability.
 * @returns {{ capability_id, label, status: 'authorized'|'needs_authorization'|'unavailable'|'unknown', missing_scopes, permissionLabel, availability }}
 */
export function assessCapabilityAuthorization(capabilityId, grantedScopes = [], permissionCatalog = null) {
  const capability = capabilityFromCatalog(capabilityId, resolveCatalog(permissionCatalog));
  if (!capability) {
    return {
      capability_id: capabilityId,
      label: capabilityId,
      status: 'unknown',
      missing_scopes: [],
      permissionLabel: null,
      availability: null,
    };
  }

  const requiredScopes = capability.oauthScopes || [];
  // Token-only APIs and capabilities absent from the OAuth catalog require a
  // live probe. An empty scope list must never imply OAuth authorization.
  if (capability.tokenRequired || requiredScopes.length === 0) {
    return {
      capability_id: capability.id,
      label: capability.label,
      status: 'unknown',
      missing_scopes: [],
      permissionLabel: capability.permissionLabel,
      availability: capability.availability,
      availability_note: capability.availabilityNote || null,
      token_required: Boolean(capability.tokenRequired),
      probe_required: true,
    };
  }

  const granted = new Set((grantedScopes || []).map(String));
  const missing = requiredScopes.filter((scope) => !granted.has(scope));
  if (capability.availability === 'subscription' || capability.availability === 'enterprise_addon') {
    return {
      capability_id: capability.id,
      label: capability.label,
      status: missing.length ? 'needs_authorization' : 'unknown',
      missing_scopes: missing,
      permissionLabel: capability.permissionLabel,
      availability: capability.availability,
      availability_note: capability.availabilityNote || null,
      probe_required: true,
    };
  }
  if (!grantedScopes?.length) {
    return {
      capability_id: capability.id,
      label: capability.label,
      status: 'unknown',
      missing_scopes: [...requiredScopes],
      permissionLabel: capability.permissionLabel,
      availability: capability.availability,
      availability_note: capability.availabilityNote || null,
      probe_required: true,
    };
  }
  return {
    capability_id: capability.id,
    label: capability.label,
    status: missing.length ? 'needs_authorization' : 'authorized',
    missing_scopes: missing,
    permissionLabel: capability.permissionLabel,
    availability: capability.availability,
    availability_note: capability.availabilityNote || null,
  };
}

export function capabilityAuthorizationMatrix(grantedScopes = [], capabilityIds = null, permissionCatalog = null) {
  const ids = capabilityIds || listCloudflareCapabilities(permissionCatalog).map((capability) => capability.id);
  return ids.map((id) => assessCapabilityAuthorization(id, grantedScopes, permissionCatalog));
}

/** Structured remediation when CF returns 403 / missing permission. */
export function cloudflarePermissionRemediation({
  capabilityId = null,
  operation = null,
  httpStatus = null,
  providerMessage = null,
  permissionCatalog = null,
} = {}) {
  const capability = capabilityId
    ? capabilityFromCatalog(capabilityId, resolveCatalog(permissionCatalog))
    : null;
  return {
    ok: false,
    error: 'cloudflare_permission_denied',
    operation: operation || null,
    http_status: httpStatus,
    provider_message: providerMessage,
    capability_id: capability?.id || capabilityId,
    permission_required: capability?.permissionLabel || null,
    availability: capability?.availability || null,
    availability_note: capability?.availabilityNote || null,
    oauth_scopes: capability?.oauthScopes || [],
    remediation: {
      actions: [
        capability ? `Authorize ${capability.label}` : 'Authorize required Cloudflare permission',
        'Show required permissions',
        'Cancel',
      ],
      authorize_hint: capability
        ? `agentsam cloudflare permissions authorize --capability ${capability.id}`
        : 'agentsam cloudflare permissions',
      learn: capability?.availability === 'enterprise_addon'
        ? 'Cloudflare → SSL/TLS → Keyless SSL (Enterprise add-on)'
        : capability?.availability === 'subscription'
          ? 'Cloudflare → Cloudforce One → Brand Protection'
          : null,
    },
  };
}
