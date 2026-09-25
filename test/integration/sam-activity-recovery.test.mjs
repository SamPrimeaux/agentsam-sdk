import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateDecisions as evaluate,
  appendOutcome,
  attachAction,
  createActivityStore,
  activityFromDecision,
  DECISION_ACTIVITY_LABELS,
} from '../../src/sam/index.js';
import {
  createErrorEnvelope,
  planRecovery,
  inferSideEffectState,
  SIDE_EFFECT_STATE,
  FAILURE_CLASS,
} from '../../packages/agentsam-errors/src/index.js';

describe('SAM decision → activity → outcome linkage', () => {
  it('emits user-facing decision.made events without choose/score/check as primary label', async () => {
    const activity = createActivityStore('run_test_1');
    const seen = [];
    activity.on((e) => seen.push(e));

    const result = await evaluate({
      state: {
        constraints: { requires_local_files: true },
        runtime: { terminal_lanes: { local: true, remote: true, sandbox: true } },
      },
      questions: ['terminal_lane', 'requires_approval'],
      run_id: 'run_test_1',
      step_id: 'step_plan',
      activity,
    });

    assert.ok(result.receipt.run_id === 'run_test_1');
    assert.ok(result.receipt.step_id === 'step_plan');
    assert.ok(seen.some((e) => e.event === 'decision.made'));
    const lane = seen.find((e) => e.evidence?.question_id === 'terminal_lane');
    assert.equal(lane.label, DECISION_ACTIVITY_LABELS.terminal_lane);
    assert.equal(lane.label.includes('choose'), false);
    assert.ok(lane.evidence.decision_id);
    assert.equal(lane.detail, 'local');
  });

  it('records supervised human corrections distinctly from weak passive accept', async () => {
    const result = await evaluate({
      state: { constraints: { requires_local_files: true }, runtime: { terminal_lanes: { local: true } } },
      questions: ['terminal_lane'],
      run_id: 'run_corr',
    });
    let receipt = attachAction(result.receipt, { kind: 'terminal.attach', summary: 'attach local pty' });
    assert.ok(receipt.action_id);

    receipt = appendOutcome(receipt, {
      success: false,
      disposition: 'corrected_to',
      human_corrected: true,
      corrected_to: 'sandbox',
      user_override: true,
      duration_ms: 1200,
      retries: 0,
    });
    assert.equal(receipt.outcome.label_strength, 'supervised');
    assert.equal(receipt.outcome.corrected_to, 'sandbox');
    assert.ok(receipt.outcome_id);

    const passive = appendOutcome(result.receipt, { success: true });
    assert.equal(passive.outcome.label_strength, 'weak_passive');
  });
});

describe('ErrorEnvelope recovery semantics', () => {
  it('refuses blind retry when side effect is unknown', () => {
    const error = createErrorEnvelope({
      reason: 'transport_timeout',
      message: 'deployment create timed out',
      code: 'DEADLINE_EXCEEDED',
      severity: 'transient',
      retryable: true,
      domain: 'deployment',
      operation: {
        kind: 'deployment.create',
        idempotent: false,
        read_only: false,
        side_effect_state: SIDE_EFFECT_STATE.UNKNOWN,
      },
    });
    assert.equal(inferSideEffectState(error), SIDE_EFFECT_STATE.UNKNOWN);
    const plan = planRecovery(error);
    assert.equal(plan.disposition, 'reconcile');
    assert.ok(plan.evidence.some((e) => /reconcile_before_retry/.test(e)));
  });

  it('retries transport failures with budget when side effect is known not applied', () => {
    const error = createErrorEnvelope({
      reason: 'connection_reset',
      message: 'reset',
      code: 'UNAVAILABLE',
      severity: 'transient',
      retryable: true,
      domain: 'transport',
      operation: {
        kind: 'fs.read',
        read_only: true,
        side_effect_state: SIDE_EFFECT_STATE.NONE,
      },
    });
    const plan = planRecovery(error, { attempt: 1, max_attempts: 4 });
    assert.ok(plan.disposition === 'retry' || plan.disposition === 'reconnect');
    assert.ok(plan.delay_ms == null || plan.delay_ms >= 0);
  });

  it('treats cancellation as abort without operator incident', () => {
    const error = createErrorEnvelope({
      reason: 'cancelled_by_user',
      message: 'Stopped',
      code: 'CANCELLED',
      severity: 'blocking_user_fixable',
      retryable: false,
      domain: 'runtime',
      resolution_owner: 'user',
      remediation: { action: 'none' },
    });
    // cancelled may not be in policy — use unknown path via custom
    const plan = planRecovery({
      ...error,
      reason: 'cancelled_by_user',
      failure_class: FAILURE_CLASS.CANCELLED,
      fingerprint: error.fingerprint,
    });
    assert.equal(plan.disposition, 'abort');
    assert.equal(plan.notify.operator, 'never');
  });

  it('activityFromDecision maps score to non-numeric user detail', () => {
    const ev = activityFromDecision({
      run_id: 'r1',
      question_id: 'change_risk',
      answer: { type: 'score', value: 1.7, question_id: 'change_risk' },
      decision_id: 'dec_x',
    });
    assert.equal(ev.label, 'Assessing change risk');
    assert.equal(ev.detail, 'Bounded');
    assert.equal(ev.evidence.question_type, 'score');
  });
});
