/**
 * Deterministic state helpers for SAM planners.
 * Pure machine utilities — no D1, model, or repository assumptions.
 */

/**
 * Stable deterministic identity for plain object / array / primitive state.
 * Object keys are sorted so insertion order does not affect identity.
 * @param {unknown} value
 * @returns {string}
 */
export function stableStateKey(value) {
  return stringifyStable(value);
}

/**
 * Shallow clone of a plain object state (GOAP worlds are flat fact maps).
 * @param {Record<string, unknown>|null|undefined} state
 * @returns {Record<string, unknown>}
 */
export function cloneState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {};
  }
  return { ...state };
}

/**
 * Merge effects onto a clone of state (never mutates input).
 * @param {Record<string, unknown>} state
 * @param {Record<string, unknown>|null|undefined} effects
 * @returns {Record<string, unknown>}
 */
export function applyEffects(state, effects) {
  const next = cloneState(state);
  if (!effects || typeof effects !== 'object') return next;
  for (const [key, value] of Object.entries(effects)) {
    next[key] = value;
  }
  return next;
}

/**
 * True when every desired goal fact matches current state (===).
 * @param {Record<string, unknown>} state
 * @param {Record<string, unknown>|null|undefined} goal
 */
export function goalSatisfied(state, goal) {
  if (!goal || typeof goal !== 'object') return true;
  return Object.entries(goal).every(([key, value]) => state[key] === value);
}

/**
 * True when every precondition matches current state (===).
 * @param {Record<string, unknown>} state
 * @param {Record<string, unknown>|null|undefined} preconditions
 */
export function preconditionsMet(state, preconditions) {
  if (!preconditions || typeof preconditions !== 'object') return true;
  return Object.entries(preconditions).every(([key, value]) => state[key] === value);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function stringifyStable(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'undefined') return 'undefined';
  if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
  if (t === 'string') return JSON.stringify(value);
  if (t === 'symbol') return value.toString();
  if (typeof value === 'function') return `"fn:${value.name || 'anonymous'}"`;
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStable(item)).join(',')}]`;
  }
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyStable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
}
