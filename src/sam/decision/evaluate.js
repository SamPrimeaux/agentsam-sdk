/**
 * Multi-question batch evaluation.
 *
 * Questions in one batch:
 * - see the same original state
 * - are logically independent
 * - do not consume another question's answer
 */

import { buildDecisionState, hashDecisionState } from './state.js';
import { validateQuestionBatch } from './validate.js';
import { selectEvaluator, DEFAULT_CHAIN } from './evaluators/select.js';
import { applyDecisionPolicy } from './policy.js';
import { createDecisionReceipt } from './receipt.js';
import { DECISION_EVALUATION_SCHEMA } from './types.js';
import { getRegisteredQuestion } from './questions.js';
import { activityFromDecision } from '../activity/index.js';

/**
 * @param {object} opts
 * @param {object} opts.state
 * @param {Array<object|string>} opts.questions  question objects or registry ids
 * @param {object[]} [opts.evaluators]
 * @param {object} [opts.policy]
 * @param {boolean} [opts.receipt]
 */
export async function evaluate(opts = {}) {
  const state = buildDecisionState(opts.state || {});
  const stateHash = hashDecisionState(state);
  const questions = validateQuestionBatch(
    (opts.questions || []).map((q) => (typeof q === 'string' ? getRegisteredQuestion(q) : q)),
  );
  const evaluators = opts.evaluators || DEFAULT_CHAIN;

  // Group by selected evaluator — each question independently routed.
  /** @type {Map<object, object[]>} */
  const groups = new Map();
  /** @type {Record<string, object>} */
  const routing = {};
  for (const q of questions) {
    const ev = selectEvaluator(q, evaluators);
    routing[q.id] = { kind: ev.kind, version: ev.version };
    if (!groups.has(ev)) groups.set(ev, []);
    groups.get(ev).push(q);
  }

  /** @type {Record<string, object>} */
  const answers = {};
  /** @type {object[]} */
  const usedEvaluators = [];
  let modelUsed = false;

  for (const [ev, qs] of groups) {
    // Each group receives the SAME original state — never prior answers.
    const result = await ev.evaluate(state, qs);
    usedEvaluators.push(result.evaluator || { kind: ev.kind, version: ev.version });
    if (result.model_used) modelUsed = true;
    for (const [id, answer] of Object.entries(result.answers || {})) {
      // Independence check: answer must not reference sibling answers.
      if (answer && answer._consumed_answers) {
        const err = new Error(`question_dependency_leak:${id}`);
        err.code = 'question_independence_violated';
        throw err;
      }
      answers[id] = answer;
    }
  }

  // Ensure every question answered
  for (const q of questions) {
    if (!answers[q.id]) {
      const err = new Error(`missing_answer:${q.id}`);
      err.code = 'evaluation_incomplete';
      throw err;
    }
  }

  const policy_result = applyDecisionPolicy({
    answers,
    policy: opts.policy || {},
    state,
  });

  const evaluation = {
    schema: DECISION_EVALUATION_SCHEMA,
    ok: true,
    state_hash: stateHash,
    answers,
    routing,
    policy_result,
    model_used: modelUsed,
    deterministic: !modelUsed,
    question_versions: Object.fromEntries(questions.map((q) => [q.id, q.version])),
  };

  if (opts.receipt !== false) {
    evaluation.receipt = createDecisionReceipt({
      state,
      state_hash: stateHash,
      answers,
      policy_result,
      question_ids: questions.map((q) => q.id),
      question_versions: evaluation.question_versions,
      evaluators: usedEvaluators,
      evaluator: usedEvaluators[0] || null,
      action: opts.action ?? null,
      run_id: opts.run_id ?? null,
      step_id: opts.step_id ?? null,
      action_id: opts.action_id ?? null,
      evidence: opts.evidence || [],
    });
  }

  // Optional live activity fan-out (Studio / CLI share the same events)
  if (opts.activity && typeof opts.activity.emit === 'function' && evaluation.receipt) {
    for (const [qid, answer] of Object.entries(answers)) {
      opts.activity.emit(
        activityFromDecision({
          run_id: opts.run_id || opts.activity.run_id,
          step_id: opts.step_id,
          decision_id: evaluation.receipt.decision_id,
          question_id: qid,
          answer,
          phase: opts.activity_phase || 'plan',
        }),
      );
    }
  }

  return evaluation;
}

/**
 * Explicit two-stage evaluation: stage2 state must be newly built by caller.
 * @param {object} stage1  evaluate() opts
 * @param {(stage1Result: object) => object|Promise<object>} buildStage2State
 * @param {object} stage2  { questions, policy?, evaluators? }
 */
export async function evaluateDependentStages(stage1, buildStage2State, stage2) {
  const first = await evaluate(stage1);
  if (typeof buildStage2State !== 'function') {
    const err = new Error('dependent_stage_requires_explicit_state_builder');
    err.code = 'invalid_dependent_stage';
    throw err;
  }
  const nextState = await buildStage2State(first);
  if (!nextState || nextState === stage1.state) {
    const err = new Error('dependent_stage_must_build_new_state');
    err.code = 'invalid_dependent_stage';
    throw err;
  }
  const second = await evaluate({
    ...stage2,
    state: nextState,
  });
  return { stage1: first, stage2: second };
}
