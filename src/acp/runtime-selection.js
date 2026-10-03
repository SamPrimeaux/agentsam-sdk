import { capabilitiesSatisfy, RUNTIME_PROTOCOL_SCHEMA } from '../../packages/runtime-protocol/src/index.js';

const DEFAULT_RUNNABLE_STATUSES = Object.freeze(['ready', 'online', 'sleeping']);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const one = clean(value);
  return one ? [one] : [];
}

export function normalizeRequiredCapabilities(value = {}) {
  if (Array.isArray(value)) {
    return Object.freeze(Object.fromEntries(value.map(clean).filter(Boolean).map((key) => [key, true])));
  }
  if (!value || typeof value !== 'object') return Object.freeze({});
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, enabled]) => [clean(key), Boolean(enabled)]).filter(([key]) => key),
  ));
}

export function normalizeRuntimeRequirements(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const exact = {};
  for (const field of [
    'provider',
    'substrate',
    'provider_product',
    'lifecycle',
    'runtime_adapter',
    'architecture',
    'os',
    'transport',
    'auth_mode',
  ]) {
    const resolved = clean(input[field]);
    if (resolved) exact[field] = resolved;
  }

  return Object.freeze({
    schema: 'agentsam.runtime-requirements.v1',
    exact: Object.freeze(exact),
    capabilities: normalizeRequiredCapabilities(input.capabilities),
    statuses: Object.freeze(
      stringList(input.statuses ?? input.status).length
        ? stringList(input.statuses ?? input.status)
        : [...DEFAULT_RUNNABLE_STATUSES],
    ),
    preferredProviders: Object.freeze(stringList(input.preferred_providers ?? input.preferredProviders)),
    preferredSubstrates: Object.freeze(stringList(input.preferred_substrates ?? input.preferredSubstrates)),
  });
}

function unwrapRuntime(candidate) {
  if (candidate?.runtime && typeof candidate.runtime === 'object') {
    return { id: clean(candidate.id || candidate.runtime_id || candidate.runtime.id) || null, runtime: candidate.runtime };
  }
  return { id: clean(candidate?.id || candidate?.runtime_id) || null, runtime: candidate || {} };
}

export function matchRuntimeCandidate(candidate, requirements = {}) {
  const normalized = requirements?.schema === 'agentsam.runtime-requirements.v1'
    ? requirements
    : normalizeRuntimeRequirements(requirements);
  const { id, runtime } = unwrapRuntime(candidate);
  const mismatches = [];

  if (runtime.schema && runtime.schema !== RUNTIME_PROTOCOL_SCHEMA) {
    mismatches.push({ field: 'schema', required: RUNTIME_PROTOCOL_SCHEMA, actual: runtime.schema });
  }

  for (const [field, required] of Object.entries(normalized.exact)) {
    if (clean(runtime[field]) !== required) {
      mismatches.push({ field, required, actual: clean(runtime[field]) || null });
    }
  }

  const capabilityMatch = capabilitiesSatisfy(normalized.capabilities, runtime.capabilities || {});
  for (const missing of capabilityMatch.missing) {
    mismatches.push({ field: 'capabilities.' + missing, required: true, actual: runtime.capabilities?.[missing] ?? false });
  }

  if (normalized.statuses.length && !normalized.statuses.includes(clean(runtime.status))) {
    mismatches.push({
      field: 'status',
      required: normalized.statuses,
      actual: clean(runtime.status) || null,
    });
  }

  return Object.freeze({
    ok: mismatches.length === 0,
    id,
    runtime,
    mismatches: Object.freeze(mismatches),
    missingCapabilities: Object.freeze(capabilityMatch.missing),
  });
}

function preferenceIndex(list, value) {
  const index = list.indexOf(clean(value));
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function readinessIndex(status) {
  const value = clean(status);
  if (value === 'ready') return 0;
  if (value === 'online') return 1;
  if (value === 'sleeping') return 2;
  return 3;
}

/**
 * Hard-filter using agentsam.runtime.v1, then apply only explicit preferences.
 * There is no cloud-provider-specific hidden score.
 */
export function selectRuntimeCandidate(candidates = [], requirements = {}) {
  const normalized = normalizeRuntimeRequirements(requirements);
  const evaluations = candidates.map((candidate, index) => ({
    index,
    candidate,
    match: matchRuntimeCandidate(candidate, normalized),
  }));
  const eligible = evaluations.filter((row) => row.match.ok);

  eligible.sort((a, b) => {
    const ap = preferenceIndex(normalized.preferredProviders, a.match.runtime.provider);
    const bp = preferenceIndex(normalized.preferredProviders, b.match.runtime.provider);
    if (ap !== bp) return ap - bp;

    const as = preferenceIndex(normalized.preferredSubstrates, a.match.runtime.substrate);
    const bs = preferenceIndex(normalized.preferredSubstrates, b.match.runtime.substrate);
    if (as !== bs) return as - bs;

    const ar = readinessIndex(a.match.runtime.status);
    const br = readinessIndex(b.match.runtime.status);
    if (ar !== br) return ar - br;

    const aid = a.match.id || '';
    const bid = b.match.id || '';
    if (aid && bid && aid !== bid) return aid.localeCompare(bid);
    return a.index - b.index;
  });

  if (!eligible.length) {
    const error = new Error('runtime_unavailable');
    error.code = 'runtime_unavailable';
    error.requirements = normalized;
    error.diagnostics = evaluations.map(({ match }) => ({
      id: match.id,
      provider: match.runtime.provider ?? null,
      substrate: match.runtime.substrate ?? null,
      status: match.runtime.status ?? null,
      mismatches: match.mismatches,
    }));
    throw error;
  }

  const selected = eligible[0].match;
  return Object.freeze({
    schema: 'agentsam.runtime-selection.v1',
    runtime_id: selected.id,
    runtime: selected.runtime,
    requirements: normalized,
    eligible_count: eligible.length,
    rejected_count: evaluations.length - eligible.length,
  });
}

export function createRuntimeSelector({ listRuntimes } = {}) {
  if (typeof listRuntimes !== 'function') throw new TypeError('listRuntimes function is required');
  return async function resolveRuntime(requirements = {}, context = {}) {
    const candidates = await listRuntimes(context);
    if (!Array.isArray(candidates)) throw new TypeError('runtime registry must return an array');
    return selectRuntimeCandidate(candidates, requirements);
  };
}
