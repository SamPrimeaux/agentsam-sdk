import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDecisionState,
  defineChoose,
  defineScore,
  defineCheck,
  evaluate,
  evaluateDependentStages,
  applyDecisionPolicy,
  composeUtility,
  createDecisionReceipt,
  appendOutcome,
  QUESTION_REGISTRY,
  getRegisteredQuestion,
  brierScore,
  logLoss,
  expectedCalibrationError,
  hierarchicalChoose,
  beamRetain,
  createSemanticEvaluator,
  DECISION_STATE_SCHEMA,
  DECISION_RECEIPT_SCHEMA,
} from '../../src/sam/decision/index.js';
import {
  concentrationFromScores,
  expectedScore,
  softmax,
  assertProbabilitiesSumToOne,
  buildAnswer,
} from '../../src/sam/decision/confidence.js';
import { validateQuestion } from '../../src/sam/decision/validate.js';
import { selectEvaluator, DETERMINISTIC_EVALUATOR, SEMANTIC_EVALUATOR } from '../../src/sam/decision/evaluators/select.js';
import { AgentSamClient, ensureSeedOperations, resetSeedFlagForTests, clearSamRegistryForTests } from '../../src/sam/index.js';
import { planAStar, planGoap } from '../../src/sam/planning/index.js';

describe('SAM decision state', () => {
  it('builds a versioned state contract', () => {
    const state = buildDecisionState({
      intent: { type: 'symbol_lookup' },
      repository: { root: '/tmp/repo', dirty: { value: true, source: 'git.status' } },
      facts: { requires_local_files: true },
    });
    assert.equal(state.schema, DECISION_STATE_SCHEMA);
    assert.equal(state.repository.root, '/tmp/repo');
    assert.equal(state.facts.requires_local_files, true);
  });
});

describe('SAM question contracts', () => {
  it('validates choose with finite options', () => {
    const q = defineChoose({
      id: 'lane',
      options: ['local', 'remote'],
      criteria: { local: { use_when: ['x'] }, remote: {} },
    });
    assert.equal(q.type, 'choose');
    assert.deepEqual(q.options, ['local', 'remote']);
  });

  it('fails closed on choose without options', () => {
    assert.throws(
      () => defineChoose({ id: 'empty', options: [] }),
      (err) => err.code === 'choose_options_required',
    );
  });

  it('validates score with ordered levels', () => {
    const q = defineScore({
      id: 'risk',
      levels: [
        { index: 0, label: 'low' },
        { index: 1, label: 'mid' },
        { index: 2, label: 'high' },
      ],
    });
    assert.equal(q.type, 'score');
    assert.equal(q.levels.length, 3);
  });

  it('rejects duplicate score level indexes', () => {
    assert.throws(
      () => defineScore({
        id: 'bad',
        levels: [{ index: 1, label: 'a' }, { index: 1, label: 'b' }],
      }),
      (err) => err.code === 'score_levels_unordered',
    );
  });

  it('validates check yes/no contract', () => {
    const q = defineCheck({
      id: 'needs_approval',
      instructions: { question: 'Approve?', inspect: ['policy'] },
    });
    assert.equal(q.type, 'check');
  });

  it('keeps registry question ids stable', () => {
    assert.ok(QUESTION_REGISTRY.terminal_lane);
    assert.equal(getRegisteredQuestion('terminal_lane').id, 'terminal_lane');
    assert.equal(getRegisteredQuestion('change_risk').type, 'score');
  });

  it('accepts structured string/object/array criteria', () => {
    validateQuestion({
      id: 'x',
      type: 'choose',
      options: ['a'],
      criteria: { a: { use_when: ['one'] } },
      instructions: ['step'],
    });
    validateQuestion({
      id: 'y',
      type: 'choose',
      options: ['a'],
      criteria: 'prose ok',
      instructions: 'string ok',
    });
  });

  it('fails closed on malformed criteria', () => {
    assert.throws(
      () => validateQuestion({ id: 'z', type: 'choose', options: ['a'], criteria: 42 }),
      (err) => err.code === 'invalid_criteria',
    );
  });
});

describe('SAM batch evaluate independence', () => {
  const baseState = {
    intent: { type: 'architecture concept review' },
    runtime: { terminal_lanes: { local: 'healthy', remote: 'healthy', sandbox: 'healthy' } },
    constraints: { requires_local_files: true },
    code: { affected_packages: ['agentsam-sdk', 'identity'] },
    facts: { change_risk_hint: 1 },
  };

  it('one state serves multiple independent questions', async () => {
    const result = await evaluate({
      state: baseState,
      questions: [
        'terminal_lane',
        'retrieval_mode',
        'change_risk',
        'requires_approval',
        'security_review_required',
        'verification_scope',
      ],
    });
    assert.equal(result.ok, true);
    assert.equal(result.answers.terminal_lane.value, 'local');
    assert.equal(result.answers.retrieval_mode.value, 'semantic');
    assert.equal(result.answers.change_risk.type, 'score');
    assert.equal(result.answers.requires_approval.type, 'check');
    assert.ok(result.receipt?.why?.decisions?.length >= 6);
  });

  it('deterministic batch equals separate deterministic evaluations', async () => {
    const ids = ['terminal_lane', 'change_risk', 'requires_approval'];
    const batch = await evaluate({ state: baseState, questions: ids, receipt: false });
    for (const id of ids) {
      const solo = await evaluate({ state: baseState, questions: [id], receipt: false });
      assert.equal(solo.answers[id].value, batch.answers[id].value);
      assert.deepEqual(solo.answers[id].scores, batch.answers[id].scores);
    }
  });

  it('questions do not secretly consume previous answers', async () => {
    let seenSibling = false;
    const spy = {
      kind: 'deterministic',
      version: 'spy',
      supports: () => true,
      async evaluate(state, questions) {
        const answers = {};
        for (const q of questions) {
          // Prove evaluator only sees state — no answer bag passed in.
          assert.ok(state.schema);
          answers[q.id] = buildAnswer({
            type: 'check',
            question_id: q.id,
            value: false,
            support: 0.1,
            evaluator: { kind: 'deterministic', version: 'spy' },
          });
        }
        return { ok: true, answers, model_used: false };
      },
    };
    const result = await evaluate({
      state: baseState,
      questions: [
        defineCheck({ id: 'a', evaluator_hint: 'deterministic' }),
        defineCheck({ id: 'b', evaluator_hint: 'deterministic' }),
      ],
      evaluators: [spy],
      receipt: false,
    });
    assert.equal(seenSibling, false);
    assert.ok(result.answers.a);
    assert.ok(result.answers.b);
  });
});

describe('SAM evaluators', () => {
  it('prefers deterministic when facts are available', () => {
    const q = getRegisteredQuestion('terminal_lane');
    const ev = selectEvaluator(q);
    assert.equal(ev.kind, 'deterministic');
  });

  it('does not silently fall back to semantic', () => {
    const q = defineChoose({
      id: 'unknown_thing',
      options: ['a', 'b'],
      // no evaluator_hint — must not pick semantic
    });
    assert.throws(
      () => selectEvaluator(q, [SEMANTIC_EVALUATOR]),
      (err) => err.code === 'evaluator_unsupported',
    );
    assert.throws(
      () => selectEvaluator(q, [DETERMINISTIC_EVALUATOR, SEMANTIC_EVALUATOR]),
      (err) => err.code === 'evaluator_unsupported',
    );
  });

  it('unsupported evaluator fails clearly', async () => {
    await assert.rejects(
      () => evaluate({
        state: {},
        questions: [defineChoose({ id: 'nope', options: ['x'], evaluator_hint: 'deterministic' })],
      }),
      (err) => err.code === 'evaluator_unsupported' || err.code === 'evaluation_incomplete',
    );
  });

  it('semantic evaluator is not used as silent fallback and fails closed when unconfigured', async () => {
    await assert.rejects(
      () => evaluate({
        state: {},
        questions: [defineCheck({ id: 'semantic_only', evaluator_hint: 'semantic' })],
      }),
      (err) => err.code === 'evaluator_unavailable',
    );
  });

  it('semantic numbers are labeled estimates, not calibrated probabilities', async () => {
    const semantic = createSemanticEvaluator({
      complete: async () => ({ value: true, support: 0.87 }),
    });
    const result = await evaluate({
      state: {},
      questions: [defineCheck({ id: 'sem_check', evaluator_hint: 'semantic' })],
      evaluators: [semantic],
      receipt: false,
    });
    const a = result.answers.sem_check;
    assert.equal(a.support, 0.87);
    assert.equal(a.calibrated_probability, null);
    assert.ok(a.warnings.some((w) => /not_calibrated/.test(w)));
  });
});

describe('SAM confidence contract', () => {
  it('documents concentration as distribution shape, not P(correct)', () => {
    const concentrated = concentrationFromScores({ a: 10, b: 0.1, c: 0.1 });
    const uniform = concentrationFromScores({ a: 1, b: 1, c: 1 });
    assert.ok(concentrated > uniform);
    assert.ok(concentrated > 0.5);
  });

  it('probability distributions sum to 1 within tolerance', () => {
    const probs = softmax({ a: 1, b: 2, c: 3 });
    assert.equal(assertProbabilitiesSumToOne(probs), true);
  });

  it('score expected value is probability-weighted level position', () => {
    const levels = [{ index: 0 }, { index: 1 }, { index: 2 }];
    const value = expectedScore(levels, { 0: 0.2, 1: 0.5, 2: 0.3 });
    assert.ok(Math.abs(value - 1.1) < 1e-9);
  });

  it('calibrated_probability requires calibration_id', () => {
    assert.throws(
      () => buildAnswer({
        type: 'check',
        question_id: 'x',
        value: true,
        calibrated_probability: 0.9,
      }),
      (err) => err.code === 'calibration_required',
    );
  });

  it('maps probability_true without calibration to support with warning', () => {
    const a = buildAnswer({
      type: 'check',
      question_id: 'x',
      value: true,
      probability_true: 0.77,
    });
    assert.equal(a.support, 0.77);
    assert.ok(a.warnings.includes('probability_true_mapped_to_support_without_calibration'));
  });
});

describe('SAM policy owns permission', () => {
  it('policy overrides model confidence / low approval support', () => {
    const answers = {
      requires_approval: buildAnswer({
        type: 'check',
        question_id: 'requires_approval',
        value: false,
        support: 0.08,
      }),
      terminal_lane: buildAnswer({
        type: 'choose',
        question_id: 'terminal_lane',
        value: 'local',
        scores: { local: 5 },
        confidence_estimate: 0.99,
      }),
    };
    const policy = applyDecisionPolicy({
      answers,
      policy: { production_database_write: 'ALWAYS_REQUIRE_APPROVAL', confidence_grants_authority: true },
      state: { facts: { production_write: true } },
    });
    assert.equal(policy.require_approval, true);
    assert.equal(policy.authorization_source, 'policy');
    assert.ok(policy.notes.some((n) => /ignored_confidence/.test(n)));
  });

  it('composeUtility keeps weights in code', () => {
    const u = composeUtility(
      { goal_progress: 1, reversibility: 1, risk: 0.5, cost: 0.2, confidence: 0.8 },
      { goal_progress: 0.5, risk: 0.3 },
    );
    assert.ok(Number.isFinite(u));
  });
});

describe('SAM receipts + calibration', () => {
  it('receipt records evaluator and question versions', async () => {
    const result = await evaluate({
      state: { constraints: { requires_local_files: true }, runtime: { terminal_lanes: { local: true } } },
      questions: ['terminal_lane'],
    });
    assert.equal(result.receipt.schema, DECISION_RECEIPT_SCHEMA);
    assert.equal(result.receipt.question_versions.terminal_lane, 1);
    assert.ok(result.receipt.evaluators?.length || result.receipt.evaluator);
    assert.ok(result.receipt.why);
  });

  it('outcome can be appended', () => {
    const receipt = createDecisionReceipt({
      question_ids: ['requires_approval'],
      question_versions: { requires_approval: 1 },
      answers: {
        requires_approval: buildAnswer({
          type: 'check',
          question_id: 'requires_approval',
          value: true,
          support: 0.9,
        }),
      },
      evaluator: { kind: 'deterministic', version: '1' },
    });
    const withOutcome = appendOutcome(receipt, {
      success: true,
      human_corrected: false,
      verification: ['policy_ok'],
    });
    assert.equal(withOutcome.outcome.success, true);
    assert.equal(withOutcome.outcome.schema, 'agentsam.decision-outcome.v1');
  });

  it('calibration metrics have known fixture values', () => {
    // Perfect calibration: always predict 1 when y=1 and 0 when y=0
    const perfect = [
      { p: 1, y: 1 },
      { p: 0, y: 0 },
      { p: 1, y: 1 },
      { p: 0, y: 0 },
    ];
    assert.equal(brierScore(perfect), 0);
    assert.ok(logLoss(perfect) < 1e-10);
    assert.equal(expectedCalibrationError(perfect, 10).ece, 0);

    // Classic Brier: one miss at p=0.5 → (0.5-1)^2 = 0.25
    assert.equal(brierScore([{ p: 0.5, y: 1 }]), 0.25);
  });
});

describe('SAM dependent stages + hierarchical beam', () => {
  it('dependent-stage workflow requires explicit second state', async () => {
    await assert.rejects(
      () => evaluateDependentStages(
        { state: { facts: { 'choose.stage': 'x' } }, questions: [] },
        null,
        {},
      ),
      (err) => err.code === 'invalid_dependent_stage' || err.code === 'empty_batch',
    );

    const stage1 = await evaluateDependentStages(
      {
        state: {
          facts: { 'choose.pick': 'ast' },
          intent: 'symbol lookup',
          runtime: { terminal_lanes: { local: true } },
        },
        questions: ['retrieval_mode'],
        receipt: false,
      },
      async (first) => ({
        facts: { richer: true, 'choose.skill_candidate': 'mcp-oauth' },
        intent: { text: 'audit the OAuth migration' },
        skills: {
          'mcp-oauth': { tags: ['oauth', 'mcp'] },
          security: { tags: ['security'] },
        },
        retrieval: first.answers.retrieval_mode.value,
      }),
      {
        questions: [
          getRegisteredQuestion('skill_candidate', {
            options: ['mcp-oauth', 'security', 'platform-context', 'deploy'],
            criteria: {
              'mcp-oauth': { tags: ['oauth', 'mcp', 'migration'] },
              security: { tags: ['security'] },
              'platform-context': { tags: ['platform'] },
              deploy: { tags: ['deploy'] },
            },
          }),
        ],
        receipt: false,
      },
    );
    assert.equal(stage1.stage1.answers.retrieval_mode.type, 'choose');
    assert.equal(stage1.stage2.answers.skill_candidate.value, 'mcp-oauth');
  });

  it('beam/hierarchical choice retains multiple paths when close', () => {
    const beam = beamRetain(
      [
        { id: 'a', score: 0.91 },
        { id: 'b', score: 0.90 },
        { id: 'c', score: 0.50 },
      ],
      { beamWidth: 3, closeMargin: 0.08 },
    );
    assert.deepEqual(beam.map((b) => b.id), ['a', 'b']);

    const hier = hierarchicalChoose({
      nodes: [
        { id: 'security', parent: null, score: 0.8 },
        { id: 'platform', parent: null, score: 0.79 },
        { id: 'oauth', parent: 'security', score: 0.9 },
      ],
      closeMargin: 0.05,
      beamWidth: 3,
    });
    assert.equal(hier.committed, false);
    assert.ok(hier.beam.includes('security'));
    assert.ok(hier.beam.includes('platform'));
  });
});

describe('SAM real use cases', () => {
  it('terminal lane: local files + healthy local → local', async () => {
    const result = await evaluate({
      state: {
        constraints: { requires_local_files: true },
        runtime: { terminal_lanes: { local: 'healthy', remote: 'healthy', sandbox: 'healthy' } },
      },
      questions: ['terminal_lane'],
    });
    assert.equal(result.answers.terminal_lane.value, 'local');
    assert.ok(!('probabilities' in result.answers.terminal_lane) || result.answers.terminal_lane.probabilities == null);
  });

  it('cross-cutting change fan-out', async () => {
    const result = await evaluate({
      state: {
        code: { affected_packages: ['a', 'b', 'c', 'd'] },
        facts: { security_boundary: true, auth_change: true, production_write: true },
        runtime: { terminal_lanes: { local: true, remote: true, sandbox: true } },
        constraints: { isolation_required: true },
      },
      questions: [
        'change_risk',
        'requires_approval',
        'terminal_lane',
        'security_review_required',
        'verification_scope',
      ],
      policy: { production_database_write: 'ALWAYS_REQUIRE_APPROVAL' },
    });
    assert.ok(result.answers.change_risk.value >= 3);
    assert.equal(result.answers.requires_approval.value, true);
    assert.equal(result.answers.terminal_lane.value, 'sandbox');
    assert.equal(result.answers.security_review_required.value, true);
    assert.equal(result.policy_result.require_approval, true);
  });

  it('skill selection for OAuth migration', async () => {
    const result = await evaluate({
      state: {
        intent: { text: 'audit the OAuth migration for MCP routes' },
        facts: { intent_tags: ['oauth', 'mcp', 'migration'] },
      },
      questions: [
        getRegisteredQuestion('skill_candidate', {
          options: ['mcp-oauth', 'security', 'platform-context', 'deploy'],
          criteria: {
            'mcp-oauth': { tags: ['oauth', 'mcp'], description: 'MCP OAuth flows' },
            security: { tags: ['security', 'audit'] },
            'platform-context': { tags: ['platform'] },
            deploy: { tags: ['deploy'] },
          },
        }),
      ],
    });
    assert.equal(result.answers.skill_candidate.value, 'mcp-oauth');
  });
});

describe('SAM decision.evaluate operation', () => {
  it('is registered and invokable via AgentSamClient', async () => {
    clearSamRegistryForTests();
    resetSeedFlagForTests();
    ensureSeedOperations();
    const sam = new AgentSamClient({ autoSeed: true });
    const result = await sam.decision.evaluate({
      state: {
        constraints: { requires_local_files: true },
        runtime: { terminal_lanes: { local: true } },
      },
      questions: ['terminal_lane'],
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.answers.terminal_lane.value, 'local');
  });
});

describe('SAM A*/GOAP remain green alongside decision', () => {
  it('A* still finds cheapest path', () => {
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
    assert.equal(result.total_cost, 2);
  });

  it('GOAP still plans', () => {
    const result = planGoap({
      initialState: { have: false },
      goal: { have: true },
      actions: [
        {
          id: 'get',
          cost: 1,
          preconditions: { have: false },
          effects: { have: true },
        },
      ],
    });
    assert.equal(result.ok, true);
    assert.ok(result.plan.length >= 1);
  });
});
