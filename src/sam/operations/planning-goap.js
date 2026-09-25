import { defineSamOperation } from '../define.js';
import { planGoap, GOAP_ENGINE } from '../planning/goap.js';
import { hashJson } from '../result.js';

/**
 * GOAP planning via A* — precondition/effect actions over flat world state.
 */
export const planningGoapOp = defineSamOperation({
  id: 'planning.goap',
  version: 1,
  module: 'planning',
  action: 'goap',
  summary: 'Plan a GOAP action sequence with A* (sam-goap-astar-v1).',
  purpose:
    'Select a lowest-cost sequence of precondition/effect actions that satisfies a goal.',
  outcome:
    'Return action ids, total cost, expansion stats, and deterministic receipt evidence.',
  description:
    'Thin GOAP adapter over planning.astar. Replaces greedy cheapest-applicable loops.',
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
  capabilities: ['planning.goap', 'planning.astar'],
  artifacts: ['planning.goap.plan', 'planning.receipt'],
  cli: { command: [['plan', 'brand', '--goap']] },
  docs: { section: 'Planning', examples: ['planning-goap-basic'] },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const { initialState, goal, actions, heuristic, maxExpansions } = input || {};
    const result = planGoap({
      initialState,
      goal,
      actions,
      heuristic: typeof heuristic === 'function' ? heuristic : undefined,
      maxExpansions,
      signal: ctx.signal,
    });

    return {
      ...result,
      evidence: {
        initial_state_hash: hashJson(initialState),
        goal_hash: hashJson(goal),
        selected_actions: result.action_ids || result.plan || [],
        total_cost: result.total_cost ?? result.cost,
        expanded_states: result.expanded_states,
        max_expansions: maxExpansions ?? null,
        engine: GOAP_ENGINE,
        deterministic: true,
      },
    };
  },
});
