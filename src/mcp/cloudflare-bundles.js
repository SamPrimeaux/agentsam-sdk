/**
 * Cloudflare-hosted MCP portal servers (tool bundles), not OAuth clients.
 *
 * Each entry is an MCP *server* you can register with `agentsam mcp add <name>`.
 * OAuth consent is resolved from the host plugin permission catalog; this module
 * stores only required pack and capability identifiers. Portal management needs mcp-portals.*.
 */

import {
  normalizeProviderPermissionCatalog,
  resolvePermissionScopes,
} from '../../packages/connectors/cfoa/src/scope-registry.js';

/**
 * @typedef {object} CloudflareMcpBundle
 * @property {string} name
 * @property {string} display_name
 * @property {string} url
 * @property {'none'|'bearer'|'cloudflare_portal_oauth'|'user_oauth_cloudflare'} auth_type
 * @property {'streamable_http'|'sse'} protocol
 * @property {string[]} feature_packs — AgentSam CF feature pack ids for AgentSam-side upgrade
 * @property {string[]} capability_ids — finer granulation than packs
 * @property {string} description
 */

/** @type {readonly CloudflareMcpBundle[]} */
export const CLOUDFLARE_MCP_SERVER_BUNDLES = Object.freeze([
  {
    name: 'cloudflare-api',
    display_name: 'Cloudflare API (Code Mode)',
    url: 'https://mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: [],
    capability_ids: ['cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Full CF API via search/execute tools — Cloudflare hosts OAuth for this portal',
  },
  {
    name: 'cloudflare-docs',
    display_name: 'Cloudflare Docs',
    url: 'https://docs.mcp.cloudflare.com/mcp',
    auth_type: 'none',
    protocol: 'streamable_http',
    feature_packs: [],
    capability_ids: [],
    portal_manage_scopes: [],
    description: 'Cloudflare developer documentation reference',
  },
  {
    name: 'cloudflare-bindings',
    display_name: 'Cloudflare Workers Bindings',
    url: 'https://bindings.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['store', 'build', 'create'],
    capability_ids: [
      'cloudflare.workers',
      'cloudflare.d1',
      'cloudflare.kv',
      'cloudflare.r2',
      'cloudflare.ai',
      'cloudflare.mcp_portals',
    ],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Workers storage, AI, and compute bindings',
  },
  {
    name: 'cloudflare-builds',
    display_name: 'Cloudflare Workers Builds',
    url: 'https://builds.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['build'],
    capability_ids: ['cloudflare.workers', 'cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Workers Builds / CI insights (workers-ci.*)',
  },
  {
    name: 'cloudflare-observability',
    display_name: 'Cloudflare Observability',
    url: 'https://observability.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['watch'],
    capability_ids: ['cloudflare.workers.observability', 'cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Workers observability / logs / analytics',
  },
  {
    name: 'cloudflare-browser',
    display_name: 'Cloudflare Browser Rendering',
    url: 'https://browser.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['create'],
    capability_ids: ['cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Fetch pages, markdown, screenshots',
  },
  {
    name: 'cloudflare-logs',
    display_name: 'Cloudflare Logpush',
    url: 'https://logs.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['watch'],
    capability_ids: ['cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Logpush job health',
  },
  {
    name: 'cloudflare-ai-gateway',
    display_name: 'Cloudflare AI Gateway',
    url: 'https://ai-gateway.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['create'],
    capability_ids: ['cloudflare.ai_gateway', 'cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'AI Gateway request logs',
  },
  {
    name: 'cloudflare-audit-logs',
    display_name: 'Cloudflare Audit Logs',
    url: 'https://auditlogs.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['watch'],
    capability_ids: ['cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Account audit log reports',
  },
  {
    name: 'cloudflare-dns-analytics',
    display_name: 'Cloudflare DNS Analytics',
    url: 'https://dns-analytics.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['publish', 'watch'],
    capability_ids: ['cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'DNS performance analytics',
  },
  {
    name: 'cloudflare-graphql',
    display_name: 'Cloudflare GraphQL',
    url: 'https://graphql.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['watch'],
    capability_ids: ['cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Analytics via GraphQL',
  },
  {
    name: 'cloudflare-containers',
    display_name: 'Cloudflare Container Sandbox',
    url: 'https://containers.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['build'],
    capability_ids: ['cloudflare.containers', 'cloudflare.mcp_portals'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Ephemeral sandboxed containers',
  },
]);

export function listCloudflareMcpBundles() {
  return [...CLOUDFLARE_MCP_SERVER_BUNDLES];
}

export function getCloudflareMcpBundle(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  return CLOUDFLARE_MCP_SERVER_BUNDLES.find((b) => b.name === key) || null;
}

/**
 * Scopes AgentSam should request (or upgrade) so a CF-connected user can
 * manage / use the portal surface — not Cloudflare's own portal OAuth dance.
 */
export function scopesForCloudflareMcpBundle(name, options = {}) {
  const bundle = getCloudflareMcpBundle(name);
  if (!bundle) return [];

  const set = new Set(bundle.portal_manage_scopes || []);
  if (bundle.feature_packs?.length || bundle.capability_ids?.length) {
    const catalog = normalizeProviderPermissionCatalog(options.permissionCatalog, 'cloudflare');
    if (!catalog) return [...set];
    const selection = resolvePermissionScopes(catalog, {
      packs: bundle.feature_packs || [],
      capabilities: bundle.capability_ids || [],
    });
    if (!selection.ok) return null;
    for (const scope of selection.scopes) set.add(scope);
  }
  if (options.includeBaseline === false) {
    for (const scope of ['account-settings.read', 'user-details.read', 'memberships.read']) set.delete(scope);
  }
  return [...set];
}

/** Catalog rows for MCP authority (server presets). */
export function cloudflareBundlesAsServerCatalog() {
  return CLOUDFLARE_MCP_SERVER_BUNDLES.map((b) => ({
    name: b.name,
    display_name: b.display_name,
    url: b.url,
    auth_type: b.auth_type,
    protocol: b.protocol,
    defaultClients: ['cursor'],
    health_status: 'unknown',
    avg_latency_ms: null,
    error_rate: null,
    description: b.description,
    feature_packs: b.feature_packs,
    capability_ids: b.capability_ids,
    portal_manage_scopes: b.portal_manage_scopes,
    provider: 'cloudflare',
    kind: 'mcp_portal_bundle',
  }));
}
