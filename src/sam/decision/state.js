/**
 * Shared SAM decision state — minimal projection for a question set.
 */

import { createHash } from 'node:crypto';
import { DECISION_STATE_SCHEMA } from './types.js';

/**
 * @param {object} [partial]
 * @returns {object}
 */
export function buildDecisionState(partial = {}) {
  const state = {
    schema: DECISION_STATE_SCHEMA,
    intent: partial.intent ?? null,
    goal: partial.goal ?? null,
    repository: partial.repository
      ? {
          repository_id: partial.repository.repository_id ?? null,
          root: partial.repository.root ?? null,
          branch: partial.repository.branch ?? null,
          dirty: partial.repository.dirty ?? null,
          merkle_root: partial.repository.merkle_root ?? null,
        }
      : null,
    code: partial.code
      ? {
          relevant_nodes: Array.isArray(partial.code.relevant_nodes) ? [...partial.code.relevant_nodes] : [],
          dependency_nodes: Array.isArray(partial.code.dependency_nodes) ? [...partial.code.dependency_nodes] : [],
          affected_packages: Array.isArray(partial.code.affected_packages) ? [...partial.code.affected_packages] : [],
        }
      : null,
    runtime: partial.runtime
      ? {
          terminal_lanes: partial.runtime.terminal_lanes ?? null,
          connection_health: partial.runtime.connection_health ?? null,
          capabilities: Array.isArray(partial.runtime.capabilities) ? [...partial.runtime.capabilities] : [],
        }
      : null,
    tools: partial.tools ?? null,
    skills: partial.skills ?? null,
    models: partial.models ?? null,
    constraints: partial.constraints
      ? {
          budget: partial.constraints.budget ?? null,
          latency: partial.constraints.latency ?? null,
          approval: partial.constraints.approval ?? null,
          security: partial.constraints.security ?? null,
          production_write: partial.constraints.production_write ?? null,
          isolation_required: partial.constraints.isolation_required ?? null,
          requires_local_files: partial.constraints.requires_local_files ?? null,
        }
      : null,
    evidence: Array.isArray(partial.evidence) ? [...partial.evidence] : [],
    history: partial.history ?? null,
    metadata: partial.metadata && typeof partial.metadata === 'object' ? { ...partial.metadata } : {},
    facts: partial.facts && typeof partial.facts === 'object' ? { ...partial.facts } : {},
  };
  return Object.freeze(deepFreezeShallow(state));
}

/**
 * Stable hash of decision state for receipts.
 * @param {object} state
 */
export function hashDecisionState(state) {
  return createHash('sha256').update(stableStringify(state)).digest('hex');
}

/**
 * Project only the keys needed for a question set (does not mutate input).
 * @param {object} state
 * @param {string[]} paths
 */
export function projectState(state, paths = []) {
  if (!paths.length) return buildDecisionState(state);
  const out = { schema: DECISION_STATE_SCHEMA, facts: {}, evidence: [], metadata: {} };
  for (const p of paths) {
    const value = getPath(state, p);
    if (value !== undefined) setPath(out, p, value);
  }
  if (state.evidence) out.evidence = [...state.evidence];
  return buildDecisionState({ ...state, ...out });
}

function getPath(obj, dotted) {
  const parts = String(dotted).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

function setPath(obj, dotted, value) {
  const parts = String(dotted).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function deepFreezeShallow(value) {
  if (!value || typeof value !== 'object') return value;
  return value;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}
