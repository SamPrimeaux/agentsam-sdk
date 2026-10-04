/**
 * Cloudflare-hosted MCP portal servers (tool bundles), not OAuth clients.
 *
 * Each entry is an MCP *server* you can register with `agentsam mcp add <name>`.
 * OAuth consent stays granular via feature packs / capability ids — never the
 * full ~315-scope catalog. Managing portals themselves needs mcp-portals.*.
 */

import {
  scopesForCapabilities,
  scopesForFeaturePacks,
} from '../../packages/connectors/cfoa/src/capabilities.js';

/**
 * @typedef {object} CloudflareMcpBundle
 * @property {string} name
 * @property {string} display_name
 * @property {string} url
 * @property {'none'|'bearer'|'cloudflare_portal_oauth'|'user_oauth_cloudflare'} auth_type
 * @property {'streamable_http'|'sse'} protocol
 * @property {string[]} feature_packs — AgentSam CF feature pack ids for AgentSam-side upgrade
 * @property {string[]} capability_ids — finer granulation than packs
 * @property {string[]} portal_manage_scopes — scopes to create/manage this portal via CF API
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
    capability_ids: [],
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
    portal_manage_scopes: ['mcp-portals.read'],
    description: 'Cloudflare developer documentation reference',
  },
  {
    name: 'cloudflare-bindings',
    display_name: 'Cloudflare Workers Bindings',
    url: 'https://bindings.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['data', 'compute', 'ai'],
    capability_ids: [
      'cloudflare.workers',
      'cloudflare.d1',
      'cloudflare.kv',
      'cloudflare.r2',
      'cloudflare.workers_ai',
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
    feature_packs: ['compute'],
    capability_ids: ['cloudflare.workers'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Workers Builds / CI insights (workers-ci.*)',
  },
  {
    name: 'cloudflare-observability',
    display_name: 'Cloudflare Observability',
    url: 'https://observability.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['compute'],
    capability_ids: ['cloudflare.workers'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Workers observability / logs / analytics',
  },
  {
    name: 'cloudflare-browser',
    display_name: 'Cloudflare Browser Rendering',
    url: 'https://browser.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['compute'],
    capability_ids: ['cloudflare.browser_rendering'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Fetch pages, markdown, screenshots',
  },
  {
    name: 'cloudflare-logs',
    display_name: 'Cloudflare Logpush',
    url: 'https://logs.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['analytics'],
    capability_ids: [],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Logpush job health',
  },
  {
    name: 'cloudflare-ai-gateway',
    display_name: 'Cloudflare AI Gateway',
    url: 'https://ai-gateway.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['ai'],
    capability_ids: ['cloudflare.workers_ai'],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'AI Gateway request logs',
  },
  {
    name: 'cloudflare-audit-logs',
    display_name: 'Cloudflare Audit Logs',
    url: 'https://auditlogs.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['analytics'],
    capability_ids: [],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Account audit log reports',
  },
  {
    name: 'cloudflare-dns-analytics',
    display_name: 'Cloudflare DNS Analytics',
    url: 'https://dns-analytics.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['dns', 'analytics'],
    capability_ids: [],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'DNS performance analytics',
  },
  {
    name: 'cloudflare-graphql',
    display_name: 'Cloudflare GraphQL',
    url: 'https://graphql.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['analytics'],
    capability_ids: [],
    portal_manage_scopes: ['mcp-portals.read', 'mcp-portals.write'],
    description: 'Analytics via GraphQL',
  },
  {
    name: 'cloudflare-containers',
    display_name: 'Cloudflare Container Sandbox',
    url: 'https://containers.mcp.cloudflare.com/mcp',
    auth_type: 'cloudflare_portal_oauth',
    protocol: 'streamable_http',
    feature_packs: ['compute'],
    capability_ids: ['cloudflare.containers'],
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

  const set = new Set();
  if (options.includePortalManage !== false) {
    for (const s of bundle.portal_manage_scopes || []) set.add(s);
  }
  for (const s of scopesForFeaturePacks(bundle.feature_packs || [], bundle.capability_ids || [])) {
    set.add(s);
  }
  if (options.includeBaseline === false) {
    // scopesForFeaturePacks always includes baseline; strip if caller asks
    for (const s of ['account-settings.read', 'user-details.read', 'memberships.read', 'offline_access']) {
      // keep offline_access — refresh still needed
      if (s !== 'offline_access') set.delete(s);
    }
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

export { scopesForCapabilities, scopesForFeaturePacks };
