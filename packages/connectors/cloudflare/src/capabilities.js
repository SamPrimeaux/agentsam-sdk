/**
 * Cloudflare capability manifests — permission-scoped, eligibility-aware.
 *
 * Law: do NOT request the full ~182-scope catalog at mint time.
 * Request baseline + upgrade when a capability needs more access.
 *
 * CLOUDFLARE_ALL_SCOPES remains a reference catalog only.
 */

/** Minimum scopes for a useful connected Cloudflare account. */
export const CLOUDFLARE_BASELINE_SCOPES = Object.freeze([
  'account-settings.read',
  'user-details.read',
  'memberships.read',
  'offline_access',
]);

/**
 * @typedef {object} CloudflareCapability
 * @property {string} id
 * @property {string} domain
 * @property {string} label
 * @property {string[]} oauthScopes — Cloudflare OAuth scope strings
 * @property {string} permissionLabel — human dashboard path
 * @property {'generally_available'|'enterprise'|'enterprise_addon'|'subscription'} availability
 * @property {string} [availabilityNote]
 * @property {boolean} [zoneScoped]
 * @property {string[]} [optionalScopes]
 */

/** @type {Record<string, CloudflareCapability>} */
export const CLOUDFLARE_CAPABILITIES = Object.freeze({
  'cloudflare.workers': {
    id: 'cloudflare.workers',
    domain: 'compute',
    label: 'Workers',
    oauthScopes: [
      'workers-scripts.read',
      'workers-scripts.write',
      'workers-routes.read',
      'workers-routes.write',
    ],
    permissionLabel: 'Account → Workers Scripts → Edit',
    availability: 'generally_available',
  },
  'cloudflare.d1': {
    id: 'cloudflare.d1',
    domain: 'data',
    label: 'D1',
    oauthScopes: ['d1.read', 'd1.write'],
    permissionLabel: 'Account → D1 → Edit',
    availability: 'generally_available',
  },
  'cloudflare.r2': {
    id: 'cloudflare.r2',
    domain: 'data',
    label: 'R2',
    oauthScopes: [
      'workers-r2.read',
      'workers-r2.write',
      'workers-r2-bucket-item.read',
      'workers-r2-bucket-item.write',
    ],
    permissionLabel: 'Account → Workers R2 Storage → Edit',
    availability: 'generally_available',
  },
  'cloudflare.images': {
    id: 'cloudflare.images',
    domain: 'data',
    label: 'Images',
    // From Local Studio OAuth scope catalog (Media → Images)
    oauthScopes: ['images.read', 'images.write'],
    permissionLabel: 'Account → Cloudflare Images → Edit',
    availability: 'generally_available',
    capabilitySpecificTokenEnv: ['CLOUDFLARE_IMAGES_API_TOKEN'],
  },
  'cloudflare.stream': {
    id: 'cloudflare.stream',
    domain: 'data',
    label: 'Stream',
    oauthScopes: ['stream.read', 'stream.write'],
    permissionLabel: 'Account → Stream → Edit',
    availability: 'generally_available',
  },
  'cloudflare.vectorize': {
    id: 'cloudflare.vectorize',
    domain: 'data',
    label: 'Vectorize',
    oauthScopes: ['vectorize.read', 'vectorize.write'],
    permissionLabel: 'Account → Vectorize → Edit',
    availability: 'generally_available',
  },
  'cloudflare.mcp_portals': {
    id: 'cloudflare.mcp_portals',
    domain: 'compute',
    label: 'MCP Portals',
    oauthScopes: ['mcp-portals.read', 'mcp-portals.write'],
    permissionLabel: 'Account → MCP Portals → Edit',
    availability: 'generally_available',
  },
  'cloudflare.agents': {
    id: 'cloudflare.agents',
    domain: 'compute',
    label: 'Agents',
    oauthScopes: ['cf-agents.write'],
    permissionLabel: 'Account → Agents → Edit',
    availability: 'generally_available',
  },
  'cloudflare.pages': {
    id: 'cloudflare.pages',
    domain: 'web',
    label: 'Pages',
    oauthScopes: ['page.read', 'page.write'],
    permissionLabel: 'Account → Pages → Edit',
    availability: 'generally_available',
  },
  'cloudflare.snippets': {
    id: 'cloudflare.snippets',
    domain: 'web',
    label: 'Snippets',
    // Do NOT invent an OAuth scope string. API permission is Snippets Read/Write.
    // Until catalog exposes a verified identifier, treat as token_required for OAuth-only.
    oauthScopes: [],
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
    oauthScopes: ['queues.read', 'queues.write'],
    permissionLabel: 'Account → Queues → Edit',
    availability: 'generally_available',
  },
  'cloudflare.flags': {
    id: 'cloudflare.flags',
    domain: 'product',
    label: 'Flagship',
    oauthScopes: ['flagship.read', 'flagship.write', 'flagship.evaluate'],
    permissionLabel: 'Account → Flagship → Edit',
    availability: 'generally_available',
  },
  'cloudflare.hyperdrive': {
    id: 'cloudflare.hyperdrive',
    domain: 'data',
    label: 'Hyperdrive',
    oauthScopes: ['query-cache.read', 'query-cache.write'],
    permissionLabel: 'Account → Hyperdrive → Edit',
    availability: 'generally_available',
  },
  'cloudflare.email.sending': {
    id: 'cloudflare.email.sending',
    domain: 'email',
    label: 'Email Sending',
    oauthScopes: ['email-sending.read', 'email-sending.write'],
    permissionLabel: 'Account → Email Sending → Edit',
    availability: 'generally_available',
  },
  'cloudflare.email.routing': {
    id: 'cloudflare.email.routing',
    domain: 'email',
    label: 'Email Routing',
    oauthScopes: ['email-routing-rule.read', 'email-routing-rule.write', 'email-routing-address.read'],
    permissionLabel: 'Zone → Email Routing',
    availability: 'generally_available',
    zoneScoped: true,
  },
  'cloudflare.workflows': {
    id: 'cloudflare.workflows',
    domain: 'compute',
    label: 'Workflows',
    oauthScopes: ['workers-scripts.read', 'workers-scripts.write'],
    permissionLabel: 'Account → Workers Scripts → Edit (Workflows)',
    availability: 'generally_available',
    availabilityNote: 'Durable multi-step executions; Free and Paid.',
  },
  'cloudflare.url_scanner': {
    id: 'cloudflare.url_scanner',
    domain: 'security',
    label: 'URL Scanner',
    oauthScopes: ['url-scanner.read', 'url-scanner.write'],
    permissionLabel: 'Account → URL Scanner → Edit',
    availability: 'generally_available',
  },
  'cloudflare.resource_tags': {
    id: 'cloudflare.resource_tags',
    domain: 'organization',
    label: 'Resource Tags',
    oauthScopes: ['tag.read', 'tag.write'],
    permissionLabel: 'Account → Resource Tagging',
    availability: 'enterprise',
    availabilityNote: 'Account resource tagging API is Enterprise (beta).',
  },
  'cloudflare.tag_gateway': {
    id: 'cloudflare.tag_gateway',
    domain: 'web',
    label: 'Google Tag Gateway',
    oauthScopes: ['zone.read', 'zone-settings.read', 'zone-settings.write'],
    permissionLabel: 'Zone → Zaraz / Google Tag Gateway (Zaraz Edit)',
    availability: 'generally_available',
    availabilityNote: 'Free. Zone-level. Requires Zaraz Admin / Domain Administrator for dashboard.',
    zoneScoped: true,
  },
  'cloudflare.brand_protection': {
    id: 'cloudflare.brand_protection',
    domain: 'security',
    label: 'Brand Protection',
    oauthScopes: [],
    permissionLabel: 'Cloudforce One → Brand Protection',
    availability: 'subscription',
    availabilityNote: 'Requires Cloudforce One / Brand Protection subscription.',
  },
  'cloudflare.keyless_ssl': {
    id: 'cloudflare.keyless_ssl',
    domain: 'tls',
    label: 'Keyless SSL',
    oauthScopes: ['ssl-and-certificates.read', 'ssl-and-certificates.write'],
    permissionLabel: 'Zone → SSL and Certificates → Edit',
    availability: 'enterprise_addon',
    availabilityNote: 'Enterprise add-on. TLS private key stays on customer key server/HSM. TLS 1.3 unsupported for Keyless.',
    zoneScoped: true,
  },
  'cloudflare.token_validation': {
    id: 'cloudflare.token_validation',
    domain: 'security',
    label: 'Token Validation (JWT)',
    oauthScopes: ['account-api-gateway.read', 'account-api-gateway.write'],
    permissionLabel: 'Zone → API Gateway / Token Validation',
    availability: 'generally_available',
    zoneScoped: true,
  },
  'cloudflare.tunnels': {
    id: 'cloudflare.tunnels',
    domain: 'web',
    label: 'Tunnel',
    oauthScopes: ['argotunnel.read', 'argotunnel.write', 'zone.read'],
    permissionLabel: 'Account → Cloudflare Tunnel',
    availability: 'generally_available',
  },
  'cloudflare.workers_ai': {
    id: 'cloudflare.workers_ai',
    domain: 'ai',
    label: 'Workers AI',
    oauthScopes: ['ai.read', 'ai.write'],
    permissionLabel: 'Account → Workers AI → Edit',
    availability: 'generally_available',
  },
  'cloudflare.ai_search': {
    id: 'cloudflare.ai_search',
    domain: 'ai',
    label: 'AI Search',
    oauthScopes: ['ai-search.read', 'ai-search.write', 'ai-search.run', 'ai-search.index'],
    permissionLabel: 'Account → AI Search',
    availability: 'generally_available',
  },
  'cloudflare.containers': {
    id: 'cloudflare.containers',
    domain: 'compute',
    label: 'Workers Containers',
    oauthScopes: ['containers.read', 'containers.write'],
    permissionLabel: 'Account → Workers Containers',
    availability: 'generally_available',
  },
  'cloudflare.secrets_store': {
    id: 'cloudflare.secrets_store',
    domain: 'security',
    label: 'Secrets Store',
    oauthScopes: ['secrets-store.read', 'secrets-store.write'],
    permissionLabel: 'Account → Secrets Store',
    availability: 'generally_available',
  },
  'cloudflare.browser_rendering': {
    id: 'cloudflare.browser_rendering',
    domain: 'compute',
    label: 'Browser Rendering',
    oauthScopes: ['browser-rendering.read', 'browser-rendering.write'],
    permissionLabel: 'Account → Browser Rendering',
    availability: 'generally_available',
  },
  'cloudflare.pipelines': {
    id: 'cloudflare.pipelines',
    domain: 'data',
    label: 'Pipelines',
    oauthScopes: ['pipelines.read', 'pipelines.write', 'pipelines.send'],
    permissionLabel: 'Account → Pipelines',
    availability: 'generally_available',
  },
  'cloudflare.kv': {
    id: 'cloudflare.kv',
    domain: 'data',
    label: 'Workers KV',
    oauthScopes: ['workers-kv-storage.read', 'workers-kv-storage.write'],
    permissionLabel: 'Account → Workers KV Storage',
    availability: 'generally_available',
  },
});

/**
 * Feature packs — authorize a product need without reading 300+ CF scopes.
 * Each pack expands to CLOUDFLARE_CAPABILITIES ids → oauthScopes via scopesForCapabilities.
 */
export const CLOUDFLARE_FEATURE_PACKS = Object.freeze({
  baseline: {
    id: 'baseline',
    label: 'Account baseline',
    description: 'Who you are + memberships (always included)',
    capabilities: [],
  },
  data: {
    id: 'data',
    label: 'Data plane',
    description: 'D1, R2, KV, Hyperdrive, Vectorize, Pipelines',
    capabilities: [
      'cloudflare.d1',
      'cloudflare.r2',
      'cloudflare.kv',
      'cloudflare.hyperdrive',
      'cloudflare.vectorize',
      'cloudflare.pipelines',
    ],
  },
  compute: {
    id: 'compute',
    label: 'Compute',
    description: 'Workers, Containers, Queues, Workflows, Agents, MCP',
    capabilities: [
      'cloudflare.workers',
      'cloudflare.containers',
      'cloudflare.queues',
      'cloudflare.workflows',
      'cloudflare.agents',
      'cloudflare.mcp_portals',
      'cloudflare.browser_rendering',
    ],
  },
  ai: {
    id: 'ai',
    label: 'AI & Search',
    description: 'Workers AI, AI Search',
    capabilities: ['cloudflare.workers_ai', 'cloudflare.ai_search'],
  },
  web: {
    id: 'web',
    label: 'Web / zones',
    description: 'Pages, Tunnels, DNS-adjacent zone ops',
    capabilities: ['cloudflare.pages', 'cloudflare.tunnels', 'cloudflare.tag_gateway'],
  },
  media: {
    id: 'media',
    label: 'Media',
    description: 'Images + Stream',
    capabilities: ['cloudflare.images', 'cloudflare.stream'],
  },
  security: {
    id: 'security',
    label: 'Security',
    description: 'Secrets Store, URL Scanner, Token Validation',
    capabilities: [
      'cloudflare.secrets_store',
      'cloudflare.url_scanner',
      'cloudflare.token_validation',
    ],
  },
  agentsam: {
    id: 'agentsam',
    label: 'AgentSam Local Studio',
    description: 'Data + compute + AI packs AgentSam needs day-to-day',
    capabilities: [
      'cloudflare.workers',
      'cloudflare.d1',
      'cloudflare.r2',
      'cloudflare.kv',
      'cloudflare.hyperdrive',
      'cloudflare.vectorize',
      'cloudflare.containers',
      'cloudflare.workers_ai',
      'cloudflare.ai_search',
      'cloudflare.secrets_store',
      'cloudflare.tunnels',
      'cloudflare.browser_rendering',
    ],
  },
});

export function listCloudflareFeaturePacks() {
  return Object.values(CLOUDFLARE_FEATURE_PACKS);
}

export function getCloudflareFeaturePack(id) {
  return CLOUDFLARE_FEATURE_PACKS[String(id || '').trim().toLowerCase()] || null;
}

/** Expand pack ids and/or capability ids into OAuth scopes (baseline included). */
export function scopesForFeaturePacks(packIds = [], extraCapabilityIds = []) {
  const caps = new Set(extraCapabilityIds || []);
  for (const raw of packIds || []) {
    const pack = getCloudflareFeaturePack(raw);
    if (!pack) continue;
    for (const id of pack.capabilities) caps.add(id);
  }
  return scopesForCapabilities({ capabilities: [...caps], includeBaseline: true });
}

/** Legacy feature → scope map (kept for docs / workers_deploy callers). */
export const CLOUDFLARE_CAPABILITY_SCOPES = Object.freeze({
  workers_deploy: {
    scopes: ['workers-scripts.write'],
    why: 'Deploy Workers for the connected account (Workers Scripts Edit).',
    capability_id: 'cloudflare.workers',
  },
  d1_inspect: {
    scopes: ['d1.read'],
    why: 'Inspect D1 databases bound to the deployable.',
    capability_id: 'cloudflare.d1',
  },
  r2_inspect: {
    scopes: ['workers-r2.read'],
    why: 'Inspect R2 buckets bound to the deployable.',
    capability_id: 'cloudflare.r2',
  },
  worker_logs: {
    scopes: ['workers-scripts.read'],
    why: 'Read Worker script metadata/logs for postdeploy health.',
    capability_id: 'cloudflare.workers',
  },
});

export function listCloudflareCapabilities() {
  return Object.values(CLOUDFLARE_CAPABILITIES);
}

export function getCloudflareCapability(id) {
  return CLOUDFLARE_CAPABILITIES[id] || null;
}

/**
 * Scopes for OAuth authorize / upgrade.
 * @param {{ capabilities?: string[], includeBaseline?: boolean, generallyAvailableOnly?: boolean }} [opts]
 */
export function scopesForCapabilities(opts = {}) {
  const includeBaseline = opts.includeBaseline !== false;
  const gaOnly = opts.generallyAvailableOnly !== false;
  const ids = Array.isArray(opts.capabilities) ? opts.capabilities : [];
  const set = new Set(includeBaseline ? CLOUDFLARE_BASELINE_SCOPES : []);
  for (const id of ids) {
    const cap = CLOUDFLARE_CAPABILITIES[id];
    if (!cap) continue;
    if (gaOnly && cap.availability !== 'generally_available') continue;
    for (const s of cap.oauthScopes || []) set.add(s);
  }
  return [...set];
}

/**
 * Compare granted scopes to a capability.
 * @returns {{ capability_id, label, status: 'authorized'|'needs_authorization'|'unavailable'|'unknown', missing_scopes, permissionLabel, availability }}
 */
export function assessCapabilityAuthorization(capabilityId, grantedScopes = []) {
  const cap = CLOUDFLARE_CAPABILITIES[capabilityId];
  if (!cap) {
    return {
      capability_id: capabilityId,
      label: capabilityId,
      status: 'unknown',
      missing_scopes: [],
      permissionLabel: null,
      availability: null,
    };
  }
  if (cap.availability === 'subscription' || cap.availability === 'enterprise_addon') {
    // Plan/subscription gates are probed live — scope presence alone is not enough.
    const granted = new Set((grantedScopes || []).map(String));
    const missing = (cap.oauthScopes || []).filter((s) => !granted.has(s));
    return {
      capability_id: cap.id,
      label: cap.label,
      status: missing.length ? 'needs_authorization' : 'unknown',
      missing_scopes: missing,
      permissionLabel: cap.permissionLabel,
      availability: cap.availability,
      availability_note: cap.availabilityNote || null,
      probe_required: true,
    };
  }
  const granted = new Set((grantedScopes || []).map(String));
  // API tokens often aren't enumerated as OAuth scopes — treat empty granted as unknown.
  if (!grantedScopes?.length) {
    return {
      capability_id: cap.id,
      label: cap.label,
      status: 'unknown',
      missing_scopes: [...(cap.oauthScopes || [])],
      permissionLabel: cap.permissionLabel,
      availability: cap.availability,
      availability_note: cap.availabilityNote || null,
      probe_required: true,
    };
  }
  const missing = (cap.oauthScopes || []).filter((s) => !granted.has(s));
  return {
    capability_id: cap.id,
    label: cap.label,
    status: missing.length ? 'needs_authorization' : 'authorized',
    missing_scopes: missing,
    permissionLabel: cap.permissionLabel,
    availability: cap.availability,
    availability_note: cap.availabilityNote || null,
  };
}

export function capabilityAuthorizationMatrix(grantedScopes = [], capabilityIds = null) {
  const ids = capabilityIds || Object.keys(CLOUDFLARE_CAPABILITIES);
  return ids.map((id) => assessCapabilityAuthorization(id, grantedScopes));
}

/** Structured remediation when CF returns 403 / missing permission. */
export function cloudflarePermissionRemediation({
  capabilityId = null,
  operation = null,
  httpStatus = null,
  providerMessage = null,
} = {}) {
  const cap = capabilityId ? CLOUDFLARE_CAPABILITIES[capabilityId] : null;
  return {
    ok: false,
    error: 'cloudflare_permission_denied',
    operation: operation || null,
    http_status: httpStatus,
    provider_message: providerMessage,
    capability_id: cap?.id || capabilityId,
    permission_required: cap?.permissionLabel || null,
    availability: cap?.availability || null,
    availability_note: cap?.availabilityNote || null,
    oauth_scopes: cap?.oauthScopes || [],
    remediation: {
      actions: [
        cap ? `Authorize ${cap.label}` : 'Authorize required Cloudflare permission',
        'Show required permissions',
        'Cancel',
      ],
      authorize_hint: cap
        ? `agentsam cloudflare permissions authorize --capability ${cap.id}`
        : 'agentsam cloudflare permissions',
      learn: cap?.availability === 'enterprise_addon'
        ? 'Cloudflare → SSL/TLS → Keyless SSL (Enterprise add-on)'
        : cap?.availability === 'subscription'
          ? 'Cloudflare → Cloudforce One → Brand Protection'
          : null,
    },
  };
}
