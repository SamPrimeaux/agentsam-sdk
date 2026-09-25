/**
 * Thin GOAP adapter over planAStar.
 * Turns precondition/effect action catalogs into an A* search space.
 */

import { planAStar, ASTAR_ENGINE } from './astar.js';
import {
  applyEffects,
  cloneState,
  goalSatisfied,
  preconditionsMet,
  stableStateKey,
} from './state.js';

export const GOAP_ENGINE = 'sam-goap-astar-v1';

/**
 * @typedef {object} GoapAction
 * @property {string} id
 * @property {number} [cost]
 * @property {Record<string, unknown>} [preconditions]
 * @property {Record<string, unknown>} [effects]
 */

/**
 * @param {object} opts
 * @param {Record<string, unknown>} opts.initialState
 * @param {Record<string, unknown>} opts.goal
 * @param {GoapAction[]} opts.actions
 * @param {(state: Record<string, unknown>) => number} [opts.heuristic]
 * @param {number} [opts.maxExpansions]
 * @param {AbortSignal} [opts.signal]
 */
export function planGoap(opts = {}) {
  const {
    initialState,
    goal,
    actions,
    heuristic,
    maxExpansions,
    signal,
  } = opts;

  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) {
    return {
      ok: false,
      status: 'invalid_input',
      plan: [],
      action_ids: [],
      total_cost: 0,
      expanded_states: 0,
      generated_states: 0,
      frontier_peak: 0,
      elapsed_ms: 0,
      engine: GOAP_ENGINE,
      error: 'initialState must be a plain object',
    };
  }
  if (!goal || typeof goal !== 'object' || Array.isArray(goal)) {
    return {
      ok: false,
      status: 'invalid_input',
      plan: [],
      action_ids: [],
      total_cost: 0,
      expanded_states: 0,
      generated_states: 0,
      frontier_peak: 0,
      elapsed_ms: 0,
      engine: GOAP_ENGINE,
      error: 'goal must be a plain object',
    };
  }
  if (!Array.isArray(actions)) {
    return {
      ok: false,
      status: 'invalid_input',
      plan: [],
      action_ids: [],
      total_cost: 0,
      expanded_states: 0,
      generated_states: 0,
      frontier_peak: 0,
      elapsed_ms: 0,
      engine: GOAP_ENGINE,
      error: 'actions must be an array',
    };
  }

  // Normalize once; never mutate caller arrays/objects during search.
  const catalog = actions.map((action, index) => {
    if (!action || typeof action !== 'object') {
      throw new TypeError(`goap_action_invalid:${index}`);
    }
    const id = typeof action.id === 'string' && action.id ? action.id : `action_${index}`;
    const cost = Number(action.cost);
    return {
      id,
      cost: Number.isFinite(cost) && cost >= 0 ? cost : 1,
      preconditions: action.preconditions && typeof action.preconditions === 'object'
        ? { ...action.preconditions }
        : {},
      effects: action.effects && typeof action.effects === 'object'
        ? { ...action.effects }
        : {},
    };
  });

  // Deterministic expansion order: cost asc, then id.
  catalog.sort((a, b) => (a.cost - b.cost) || a.id.localeCompare(b.id));

  const start = cloneState(initialState);
  const goalFacts = { ...goal };

  let result;
  try {
    result = planAStar({
      initialState: start,
      isGoal: (state) => goalSatisfied(/** @type {Record<string, unknown>} */ (state), goalFacts),
      expand: (state) => {
        const world = /** @type {Record<string, unknown>} */ (state);
        /** @type {Array<{ action: string, nextState: Record<string, unknown>, cost: number }>} */
        const out = [];
        for (const action of catalog) {
          if (!preconditionsMet(world, action.preconditions)) continue;
          const nextState = applyEffects(world, action.effects);
          // Skip no-ops that do not change state (avoids infinite self-loops).
          if (stableStateKey(nextState) === stableStateKey(world)) continue;
          out.push({
            action: action.id,
            nextState,
            cost: action.cost,
          });
        }
        return out;
      },
      heuristic: typeof heuristic === 'function'
        ? (state) => heuristic(/** @type {Record<string, unknown>} */ (state))
        : () => 0,
      stateKey: stableStateKey,
      maxExpansions,
      signal,
    });
  } catch (err) {
    return {
      ok: false,
      status: 'invalid_input',
      plan: [],
      action_ids: [],
      total_cost: 0,
      expanded_states: 0,
      generated_states: 0,
      frontier_peak: 0,
      elapsed_ms: 0,
      engine: GOAP_ENGINE,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const actionIds = result.plan.map((step) => String(step.action));
  return {
    ok: result.ok,
    status: result.status,
    plan: actionIds,
    action_ids: actionIds,
    total_cost: result.total_cost,
    cost: result.total_cost,
    final_state: result.final_state,
    expanded_states: result.expanded_states,
    generated_states: result.generated_states,
    frontier_peak: result.frontier_peak,
    elapsed_ms: result.elapsed_ms,
    engine: GOAP_ENGINE,
    astar_engine: ASTAR_ENGINE,
    error: result.error,
  };
}
