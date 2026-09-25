import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planAStar,
  planGoap,
  ASTAR_ENGINE,
  GOAP_ENGINE,
  stableStateKey,
} from '../../src/sam/planning/index.js';
import {
  brandGoapActions,
  brandWorldFromPlan,
  brandGoalFromPlan,
} from '../../packages/agentsam-brand/src/index.js';

describe('SAM A* planner', () => {
  it('finds cheapest multi-step path over expensive direct edge', () => {
    // Graph: start --1--> a --1--> goal  (cost 2)
    //         start --10--> goal         (cost 10)
    // Greedy-on-first-step with wrong heuristic could still pick expensive if we only looked local;
    // A* with h=0 must pick the cheap two-step path.
    const edges = {
      start: [
        { action: 'via_a', nextState: 'a', cost: 1 },
        { action: 'direct', nextState: 'goal', cost: 10 },
      ],
      a: [{ action: 'finish', nextState: 'goal', cost: 1 }],
      goal: [],
    };

    const result = planAStar({
      initialState: 'start',
      isGoal: (s) => s === 'goal',
      expand: (s) => edges[s] || [],
      stateKey: (s) => String(s),
    });

    assert.equal(result.status, 'found');
    assert.equal(result.ok, true);
    assert.equal(result.engine, ASTAR_ENGINE);
    assert.equal(result.total_cost, 2);
    assert.deepEqual(result.plan.map((p) => p.action), ['via_a', 'finish']);
  });

  it('does not get fooled by a cheap first action leading to an expensive future', () => {
    // start --1--> trap --100--> goal
    // start --5--> good --1--> goal
    // Greedy "cheapest applicable" would take trap first (cost 1).
    // Optimal is good path (cost 6).
    const edges = {
      start: [
        { action: 'trap', nextState: 'trap', cost: 1 },
        { action: 'good', nextState: 'good', cost: 5 },
      ],
      trap: [{ action: 'escape', nextState: 'goal', cost: 100 }],
      good: [{ action: 'arrive', nextState: 'goal', cost: 1 }],
      goal: [],
    };

    const greedy = (() => {
      const sequence = [];
      let state = 'start';
      for (let i = 0; i < 10; i += 1) {
        if (state === 'goal') break;
        const candidates = (edges[state] || []).slice().sort((a, b) => a.cost - b.cost);
        if (!candidates.length) break;
        sequence.push(candidates[0].action);
        state = candidates[0].nextState;
      }
      return sequence;
    })();
    assert.deepEqual(greedy, ['trap', 'escape'], 'sanity: greedy would pick trap');

    const result = planAStar({
      initialState: 'start',
      isGoal: (s) => s === 'goal',
      expand: (s) => edges[s] || [],
      stateKey: (s) => String(s),
    });

    assert.equal(result.status, 'found');
    assert.equal(result.total_cost, 6);
    assert.deepEqual(result.plan.map((p) => p.action), ['good', 'arrive']);
  });

  it('terminates with cycles without looping forever', () => {
    const edges = {
      a: [
        { action: 'loop', nextState: 'a', cost: 1 },
        { action: 'to_b', nextState: 'b', cost: 2 },
      ],
      b: [{ action: 'to_goal', nextState: 'goal', cost: 1 }],
      goal: [],
    };
    const result = planAStar({
      initialState: 'a',
      isGoal: (s) => s === 'goal',
      expand: (s) => edges[s] || [],
      stateKey: (s) => String(s),
      maxExpansions: 100,
    });
    assert.equal(result.status, 'found');
    assert.ok(result.expanded_states < 50);
    assert.deepEqual(result.plan.map((p) => p.action), ['to_b', 'to_goal']);
  });

  it('replaces worse paths when a better g-score is found', () => {
    // start --5--> mid --1--> goal  (total 6, discovered first via mid)
    // start --1--> side --1--> mid  (reaches mid with g=2, should replace)
    const edges = {
      start: [
        { action: 'long_to_mid', nextState: 'mid', cost: 5 },
        { action: 'to_side', nextState: 'side', cost: 1 },
      ],
      side: [{ action: 'side_to_mid', nextState: 'mid', cost: 1 }],
      mid: [{ action: 'mid_to_goal', nextState: 'goal', cost: 1 }],
      goal: [],
    };
    const result = planAStar({
      initialState: 'start',
      isGoal: (s) => s === 'goal',
      expand: (s) => edges[s] || [],
      stateKey: (s) => String(s),
    });
    assert.equal(result.status, 'found');
    assert.equal(result.total_cost, 3);
    assert.deepEqual(result.plan.map((p) => p.action), ['to_side', 'side_to_mid', 'mid_to_goal']);
  });

  it('returns no_plan for unsatisfiable goals', () => {
    const result = planAStar({
      initialState: 'a',
      isGoal: (s) => s === 'z',
      expand: (s) => (s === 'a' ? [{ action: 'to_b', nextState: 'b', cost: 1 }] : []),
      stateKey: (s) => String(s),
    });
    assert.equal(result.status, 'no_plan');
    assert.equal(result.ok, false);
    assert.deepEqual(result.plan, []);
  });

  it('returns budget_exhausted when maxExpansions is hit', () => {
    const result = planAStar({
      initialState: 0,
      isGoal: (s) => s === 1000,
      expand: (s) => [{ action: 'inc', nextState: Number(s) + 1, cost: 1 }],
      stateKey: (s) => String(s),
      maxExpansions: 3,
    });
    assert.equal(result.status, 'budget_exhausted');
    assert.equal(result.ok, false);
    assert.equal(result.expanded_states, 3);
  });

  it('returns cancelled when AbortSignal aborts', () => {
    const controller = new AbortController();
    controller.abort();
    const result = planAStar({
      initialState: 'a',
      isGoal: () => false,
      expand: () => [{ action: 'x', nextState: 'b', cost: 1 }],
      signal: controller.signal,
    });
    assert.equal(result.status, 'cancelled');
    assert.equal(result.ok, false);
  });

  it('tie-breaks deterministically', () => {
    // Two equal-cost paths to goal; order of expansion must be stable across runs.
    const edges = {
      start: [
        { action: 'b_first_listed', nextState: 'b', cost: 1 },
        { action: 'a_second_listed', nextState: 'a', cost: 1 },
      ],
      a: [{ action: 'a_goal', nextState: 'goal', cost: 1 }],
      b: [{ action: 'b_goal', nextState: 'goal', cost: 1 }],
      goal: [],
    };
    const run = () => planAStar({
      initialState: 'start',
      isGoal: (s) => s === 'goal',
      expand: (s) => edges[s] || [],
      stateKey: (s) => String(s),
    });
    const first = run();
    const second = run();
    assert.equal(first.status, 'found');
    assert.deepEqual(first.plan.map((p) => p.action), second.plan.map((p) => p.action));
    assert.equal(first.total_cost, 2);
  });

  it('does not mutate input states during search', () => {
    const initial = { x: 1 };
    const frozen = JSON.stringify(initial);
    planAStar({
      initialState: initial,
      isGoal: (s) => s.x === 3,
      expand: (s) => [{ action: 'bump', nextState: { x: s.x + 1 }, cost: 1 }],
      stateKey: stableStateKey,
    });
    assert.equal(JSON.stringify(initial), frozen);
  });
});

describe('SAM GOAP adapter', () => {
  it('plans with preconditions and effects', () => {
    const actions = [
      {
        id: 'gather_wood',
        cost: 2,
        preconditions: { has_wood: false },
        effects: { has_wood: true },
      },
      {
        id: 'build_fire',
        cost: 3,
        preconditions: { has_wood: true, fire: false },
        effects: { fire: true },
      },
      {
        id: 'magic_fire',
        cost: 50,
        preconditions: { fire: false },
        effects: { fire: true, has_wood: true },
      },
    ];
    const result = planGoap({
      initialState: { has_wood: false, fire: false },
      goal: { fire: true },
      actions,
    });
    assert.equal(result.status, 'found');
    assert.equal(result.engine, GOAP_ENGINE);
    assert.deepEqual(result.plan, ['gather_wood', 'build_fire']);
    assert.equal(result.total_cost, 5);
  });

  it('does not mutate action catalog or world during search', () => {
    const actions = [
      {
        id: 'step',
        cost: 1,
        preconditions: { done: false },
        effects: { done: true },
      },
    ];
    const world = { done: false };
    const actionsSnap = JSON.stringify(actions);
    const worldSnap = JSON.stringify(world);
    planGoap({ initialState: world, goal: { done: true }, actions });
    assert.equal(JSON.stringify(actions), actionsSnap);
    assert.equal(JSON.stringify(world), worldSnap);
  });

  it('brand GOAP actions plan through A* engine', () => {
    const plan = {
      current_state: {
        brand_scan_complete: true,
        canonical_color_tokens: false,
        duplicate_color_count: 8,
        canonical_typography: false,
        shared_button_component: false,
        header_consistency: false,
      },
    };
    const result = planGoap({
      initialState: brandWorldFromPlan(plan),
      goal: brandGoalFromPlan(plan),
      actions: brandGoapActions(),
    });
    assert.equal(result.engine, GOAP_ENGINE);
    assert.equal(result.status, 'found');
    assert.ok(result.plan.includes('establish-color-token-map'));
    assert.ok(result.plan.includes('verify-brand-surfaces'));
    assert.ok(result.plan.includes('establish-type-roles'));
    assert.ok(result.total_cost > 0);
    assert.equal(result.final_state.brand_verified, true);
  });
});
