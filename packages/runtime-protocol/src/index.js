/**
 * agentsam.runtime.v1 — Runtime Registry vocabulary (JS).
 * Physical D1 tables remain terminal_* ; domain nouns are Runtime*.
 * Schema SSOT: protocol/runtime/agentsam.runtime.v1.schema.json
 * Law: docs/architecture/AGENTSAM_RUNTIME_PROTOCOL.md
 */

export const RUNTIME_PROTOCOL_SCHEMA = 'agentsam.runtime.v1';

/** Compute owner / cloud. Application-validated (no aggressive D1 CHECK). */
export const RUNTIME_PROVIDERS = Object.freeze([
  'local',
  'google_cloud',
  'cloudflare',
  'aws',
  'azure',
  'fly',
  'custom',
]);

/** What kind of computer/environment. */
export const RUNTIME_SUBSTRATES = Object.freeze([
  'host',
  'vm',
  'container',
  'sandbox',
  'workstation',
  'microvm',
  'kubernetes',
]);

export const RUNTIME_LIFECYCLES = Object.freeze([
  'persistent',
  'scale_to_zero',
  'ephemeral',
  'job',
]);

/**
 * What speaks agentsam.runtime.v1 on the instance.
 * ExecOS is an adapter implementation — never a transport.
 */
export const RUNTIME_ADAPTERS = Object.freeze([
  'agentsamd',
  'execos_legacy',
  'cloudflare_sandbox',
  'docker_engine',
  'ssh',
  'provider_native',
]);

/** How Studio/IAM reaches the adapter. */
export const RUNTIME_TRANSPORTS = Object.freeze([
  'direct_https',
  'direct_wss',
  'cloudflare_tunnel',
  'vpc_service',
  'vpc_network',
  'service_binding',
  'local_socket',
  'provider_api',
  'ssh',
]);

export const RUNTIME_AUTH_MODES = Object.freeze([
  'connection_token',
  'platform_bridge',
  'bridge_key',
  'service_binding',
]);

/** Capability keys — discovered, never inferred from provider alone. */
export const RUNTIME_CAPABILITY_KEYS = Object.freeze([
  'exec',
  'pty',
  'filesystem',
  'persistent_filesystem',
  'process',
  'git',
  'docker',
  'gpu',
  'browser',
  'gui',
  'ports',
  'snapshot',
]);

/** @deprecated use RUNTIME_ADAPTERS */
export const RUNTIME_KINDS = RUNTIME_ADAPTERS;

/**
 * Map legacy terminal_instances.kind → substrate.
 * @param {'local_device'|'vm'|'sandbox'|string} kind
 */
export function substrateFromLegacyKind(kind) {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'local_device') return { substrate: 'host', target_lane: 'local', provider_hint: 'local' };
  if (k === 'vm') return { substrate: 'vm', target_lane: 'remote', provider_hint: 'google_cloud' };
  if (k === 'sandbox') return { substrate: 'sandbox', target_lane: 'sandbox', provider_hint: 'cloudflare' };
  return { substrate: null, target_lane: null, provider_hint: null };
}

/**
 * Map legacy connection transport + transport_provider → adapter + transport.
 * @param {{ transport?: string, transport_provider?: string }} row
 */
export function normalizeLegacyConnection(row = {}) {
  const legacyTransport = String(row.transport || '').trim().toLowerCase();
  const legacyProvider = String(row.transport_provider || '').trim().toLowerCase();
  let runtime_adapter = 'agentsamd';
  if (legacyTransport === 'execos') runtime_adapter = 'execos_legacy';
  else if (legacyTransport === 'container') runtime_adapter = 'cloudflare_sandbox';

  let transport = legacyProvider || null;
  if (!transport || transport === 'platform_vpc') {
    transport = transport === 'platform_vpc' ? 'vpc_service' : 'direct_https';
  }
  if (legacyTransport === 'container' && !legacyProvider) {
    transport = 'service_binding';
  }

  return {
    protocol: RUNTIME_PROTOCOL_SCHEMA,
    runtime_adapter,
    transport,
  };
}

/**
 * Normalize arch vocabulary (live GCP still has x64).
 * @param {string|null|undefined} arch
 */
export function normalizeArch(arch) {
  const a = String(arch || '').trim().toLowerCase();
  if (!a) return null;
  if (a === 'x64' || a === 'amd64' || a === 'x86_64') return 'x86_64';
  if (a === 'arm64' || a === 'aarch64') return 'arm64';
  return a;
}

/**
 * Hard-constraint check: every required capability must be true on candidate.
 * @param {Record<string, boolean>} required
 * @param {Record<string, boolean>} available
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function capabilitiesSatisfy(required = {}, available = {}) {
  const missing = [];
  for (const [key, need] of Object.entries(required)) {
    if (!need) continue;
    if (available[key] !== true) missing.push(key);
  }
  return { ok: missing.length === 0, missing };
}
