import { defineSamOperation } from '../define.js';
import { planAStar, ASTAR_ENGINE } from '../planning/astar.js';
import { hashJson } from '../result.js';
import { stableStateKey } from '../planning/state.js';

/**
 * Pure A* search — domain-independent machine primitive.
 * Input supplies expand/isGoal; handler does not call models or D1.
 */
export const planningAstarOp = defineSamOperation({
  id: 'planning.astar',
  version: 1,
  module: 'planning',
  action: 'astar',
  summary: 'Run domain-independent A* search over an explicit expand graph.',
  purpose:
    'Find a lowest-cost path through an explicit state graph using f(n)=g(n)+h(n).',
  outcome:
    'Return a typed plan with cost, expansion stats, and deterministic receipt evidence.',
  description:
    'Systematic Autonomous Machinery planner. Default heuristic is 0 (Dijkstra). No model spend.',
  skill: { id: 'agentsam-app-fundamentals', help: true },
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'never',
    embedding: 'never',
    network: 'none',
    sideEffects: 'none',
    provider_spend: 'none',
  },
  risk: 'read_only',
  capabilities: ['planning.astar'],
  artifacts: ['planning.plan', 'planning.receipt'],
  cli: { command: [] },
  docs: { section: 'Planning', examples: ['planning-astar-basic'] },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const {
      initialState,
      isGoal,
      expand,
      heuristic,
      stateKey,
      maxExpansions,
    } = input || {};

    if (typeof isGoal !== 'function' || typeof expand !== 'function') {
      const err = new Error('planning.astar requires isGoal and expand functions in input');
      err.code = 'invalid_input';
      throw err;
    }

    const result = planAStar({
      initialState,
      isGoal,
      expand,
      heuristic: typeof heuristic === 'function' ? heuristic : undefined,
      stateKey: typeof stateKey === 'function' ? stateKey : stableStateKey,
      maxExpansions,
      signal: ctx.signal,
    });

    return {
      ...result,
      engine: ASTAR_ENGINE,
      evidence: {
        initial_state_hash: hashJson(initialState),
        selected_actions: result.plan.map((step) => step.action),
        total_cost: result.total_cost,
        expanded_states: result.expanded_states,
        max_expansions: maxExpansions ?? null,
        engine: ASTAR_ENGINE,
        deterministic: true,
      },
    };
  },
});
