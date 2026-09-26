/**
 * agentsam.runtime.v1 — shared enums + helpers (JS).
 * Schema SSOT: protocol/runtime/agentsam.runtime.v1.schema.json
 */

export const RUNTIME_PROTOCOL_SCHEMA = 'agentsam.runtime.v1';

export const RUNTIME_PROVIDERS = Object.freeze([
  'local',
  'cloudflare',
  'gcp',
  'aws',
  'azure',
  'fly',
  'custom',
]);

export const RUNTIME_SUBSTRATES = Object.freeze([
  'host',
  'vm',
  'container',
  'microvm',
  'sandbox',
  'workstation',
  'kubernetes',
]);

export const RUNTIME_LIFECYCLES = Object.freeze([
  'persistent',
  'scale_to_zero',
  'ephemeral',
  'job',
]);

export const RUNTIME_KINDS = Object.freeze([
  'agentsamd',
  'sandbox_api',
  'provider_native',
]);

export const RUNTIME_TRANSPORTS = Object.freeze([
  'direct',
  'service_binding',
  'tunnel',
  'vpc_service',
  'vpc_network',
  'public_wss',
  'provider_api',
  'execos',
]);

/** Capability keys — discovered, never inferred from provider name alone. */
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

/**
 * Map legacy terminal_instances.kind → substrate (+ derived lane for compat).
 * @param {'local_device'|'vm'|'sandbox'|string} kind
 */
export function substrateFromLegacyKind(kind) {
  const k = String(kind || '').trim().toLowerCase();
  if (k === 'local_device') return { substrate: 'host', target_lane: 'local', provider_hint: 'local' };
  if (k === 'vm') return { substrate: 'vm', target_lane: 'remote', provider_hint: 'gcp' };
  if (k === 'sandbox') return { substrate: 'sandbox', target_lane: 'sandbox', provider_hint: 'cloudflare' };
  return { substrate: null, target_lane: null, provider_hint: null };
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
