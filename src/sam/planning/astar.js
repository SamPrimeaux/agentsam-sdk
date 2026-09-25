/**
 * Domain-independent A* planner for Systematic Autonomous Machinery.
 *
 * f(n) = g(n) + h(n)
 * Default heuristic is 0 (Dijkstra) — preserve optimality when h is admissible.
 *
 * No model / D1 / repository assumptions.
 */

import { stableStateKey } from './state.js';

export const ASTAR_ENGINE = 'sam-astar-v1';

/** @typedef {'found'|'no_plan'|'budget_exhausted'|'cancelled'|'invalid_input'} AStarStatus */

/**
 * @typedef {object} AStarStep
 * @property {unknown} action
 * @property {unknown} [state]
 * @property {number} [cost]
 */

/**
 * @typedef {object} AStarResult
 * @property {boolean} ok
 * @property {AStarStatus} status
 * @property {AStarStep[]} plan
 * @property {number} total_cost
 * @property {unknown} [final_state]
 * @property {number} expanded_states
 * @property {number} generated_states
 * @property {number} frontier_peak
 * @property {number} elapsed_ms
 * @property {string} engine
 * @property {string} [error]
 */

/**
 * Binary min-heap keyed by f, then g (prefer deeper when f ties), then order, then stateKey.
 * Deterministic tie-breaking for reproducible plans.
 */
class Frontier {
  constructor() {
    /** @type {{ f: number, g: number, order: number, key: string, state: unknown, action: unknown, parentKey: string|null }[]} */
    this.heap = [];
  }

  get size() {
    return this.heap.length;
  }

  /**
   * @param {{ f: number, g: number, order: number, key: string, state: unknown, action: unknown, parentKey: string|null }} node
   */
  push(node) {
    this.heap.push(node);
    this.#siftUp(this.heap.length - 1);
  }

  pop() {
    const heap = this.heap;
    if (!heap.length) return null;
    const top = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      this.#siftDown(0);
    }
    return top;
  }

  /**
   * @param {number} i
   */
  #siftUp(i) {
    const heap = this.heap;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (compareNodes(heap[i], heap[p]) >= 0) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  }

  /**
   * @param {number} i
   */
  #siftDown(i) {
    const heap = this.heap;
    const n = heap.length;
    while (true) {
      let best = i;
      const l = i * 2 + 1;
      const r = l + 1;
      if (l < n && compareNodes(heap[l], heap[best]) < 0) best = l;
      if (r < n && compareNodes(heap[r], heap[best]) < 0) best = r;
      if (best === i) break;
      [heap[i], heap[best]] = [heap[best], heap[i]];
      i = best;
    }
  }
}

/**
 * @param {{ f: number, g: number, order: number, key: string }} a
 * @param {{ f: number, g: number, order: number, key: string }} b
 */
function compareNodes(a, b) {
  if (a.f !== b.f) return a.f - b.f;
  // Prefer higher g when f ties (deeper / more committed path) — classic A* tie-break.
  if (a.g !== b.g) return b.g - a.g;
  if (a.order !== b.order) return a.order - b.order;
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

/**
 * @param {object} opts
 * @param {unknown} opts.initialState
 * @param {(state: unknown) => boolean} opts.isGoal
 * @param {(state: unknown) => Array<{ action: unknown, nextState: unknown, cost?: number }>} opts.expand
 * @param {(state: unknown) => number} [opts.heuristic]
 * @param {(state: unknown) => string} [opts.stateKey]
 * @param {number} [opts.maxExpansions]
 * @param {AbortSignal} [opts.signal]
 * @returns {AStarResult}
 */
export function planAStar(opts = {}) {
  const started = Date.now();
  const {
    initialState,
    isGoal,
    expand,
    heuristic = () => 0,
    stateKey = stableStateKey,
    maxExpansions = Number.POSITIVE_INFINITY,
    signal,
  } = opts;

  /** @type {AStarResult} */
  const base = {
    ok: false,
    status: 'invalid_input',
    plan: [],
    total_cost: 0,
    expanded_states: 0,
    generated_states: 0,
    frontier_peak: 0,
    elapsed_ms: 0,
    engine: ASTAR_ENGINE,
  };

  if (typeof isGoal !== 'function' || typeof expand !== 'function') {
    return finish(base, 'invalid_input', { error: 'isGoal and expand are required functions' }, started);
  }
  if (typeof heuristic !== 'function' || typeof stateKey !== 'function') {
    return finish(base, 'invalid_input', { error: 'heuristic and stateKey must be functions' }, started);
  }
  if (!(typeof maxExpansions === 'number' && maxExpansions >= 0)) {
    return finish(base, 'invalid_input', { error: 'maxExpansions must be a non-negative number' }, started);
  }

  if (signal?.aborted) {
    return finish(base, 'cancelled', { error: 'aborted_before_start' }, started);
  }

  const startKey = stateKey(initialState);
  const open = new Frontier();
  /** @type {Map<string, number>} */
  const bestG = new Map();
  /** @type {Map<string, { parentKey: string|null, action: unknown, state: unknown, g: number }>} */
  const cameFrom = new Map();

  let order = 0;
  const h0 = Math.max(0, Number(heuristic(initialState)) || 0);
  open.push({
    f: h0,
    g: 0,
    order: order++,
    key: startKey,
    state: initialState,
    action: null,
    parentKey: null,
  });
  bestG.set(startKey, 0);
  cameFrom.set(startKey, { parentKey: null, action: null, state: initialState, g: 0 });
  base.generated_states = 1;
  base.frontier_peak = 1;

  while (open.size > 0) {
    if (signal?.aborted) {
      return finish(base, 'cancelled', { error: 'aborted' }, started);
    }

    const current = open.pop();
    if (!current) break;

    const knownG = bestG.get(current.key);
    // Superseded entry still in heap — skip.
    if (knownG !== undefined && current.g > knownG) continue;

    if (isGoal(current.state)) {
      const plan = reconstructPlan(cameFrom, current.key);
      return finish(base, 'found', {
        ok: true,
        plan,
        total_cost: current.g,
        final_state: current.state,
      }, started);
    }

    if (base.expanded_states >= maxExpansions) {
      return finish(base, 'budget_exhausted', {
        error: `maxExpansions=${maxExpansions}`,
        final_state: current.state,
      }, started);
    }

    base.expanded_states += 1;

    let successors;
    try {
      successors = expand(current.state);
    } catch (err) {
      return finish(base, 'invalid_input', {
        error: err instanceof Error ? err.message : String(err),
      }, started);
    }

    if (!Array.isArray(successors)) {
      return finish(base, 'invalid_input', { error: 'expand must return an array' }, started);
    }

    for (const step of successors) {
      if (!step || typeof step !== 'object') continue;
      const cost = Number(step.cost);
      const stepCost = Number.isFinite(cost) && cost >= 0 ? cost : 1;
      const nextState = step.nextState;
      const nextKey = stateKey(nextState);
      const tentativeG = current.g + stepCost;
      const prior = bestG.get(nextKey);
      if (prior !== undefined && tentativeG >= prior) continue;

      bestG.set(nextKey, tentativeG);
      cameFrom.set(nextKey, {
        parentKey: current.key,
        action: step.action,
        state: nextState,
        g: tentativeG,
      });
      const h = Math.max(0, Number(heuristic(nextState)) || 0);
      open.push({
        f: tentativeG + h,
        g: tentativeG,
        order: order++,
        key: nextKey,
        state: nextState,
        action: step.action,
        parentKey: current.key,
      });
      base.generated_states += 1;
      if (open.size > base.frontier_peak) base.frontier_peak = open.size;
    }
  }

  return finish(base, 'no_plan', { error: 'frontier_empty' }, started);
}

/**
 * @param {Map<string, { parentKey: string|null, action: unknown, state: unknown, g: number }>} cameFrom
 * @param {string} goalKey
 * @returns {AStarStep[]}
 */
function reconstructPlan(cameFrom, goalKey) {
  /** @type {AStarStep[]} */
  const steps = [];
  let key = goalKey;
  while (true) {
    const node = cameFrom.get(key);
    if (!node || node.parentKey === null) break;
    const parent = cameFrom.get(node.parentKey);
    const stepCost = parent ? node.g - parent.g : node.g;
    steps.push({
      action: node.action,
      state: node.state,
      cost: stepCost,
    });
    key = node.parentKey;
  }
  steps.reverse();
  return steps;
}

/**
 * @param {AStarResult} base
 * @param {AStarStatus} status
 * @param {Partial<AStarResult>} extra
 * @param {number} started
 * @returns {AStarResult}
 */
function finish(base, status, extra, started) {
  return {
    ...base,
    ...extra,
    status,
    ok: status === 'found',
    elapsed_ms: Date.now() - started,
    engine: ASTAR_ENGINE,
  };
}
