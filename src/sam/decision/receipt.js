/**
 * Decision receipts + outcome reconciliation + run/step/action linkage.
 */

import { randomUUID } from 'node:crypto';
import { DECISION_RECEIPT_SCHEMA, DECISION_OUTCOME_SCHEMA } from './types.js';
import { hashDecisionState } from './state.js';

export const OUTCOME_DISPOSITIONS = Object.freeze([
  'accepted',
  'rejected',
  'overridden',
  'corrected_to',
  'retry_required',
  'verification_failed',
  'user_intervened',
  'success',
  'failure',
]);

/**
 * @param {object} opts
 */
export function createDecisionReceipt(opts = {}) {
  const decision_id = opts.decision_id || `dec_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  return {
    schema: DECISION_RECEIPT_SCHEMA,
    decision_id,
    run_id: opts.run_id ?? null,
    step_id: opts.step_id ?? null,
    action_id: opts.action_id ?? null,
    outcome_id: null,
    question_contract: opts.question_contract || null,
    question_ids: Array.isArray(opts.question_ids) ? opts.question_ids : [],
    question_versions: opts.question_versions || {},
    evaluator: opts.evaluator || null,
    evaluators: opts.evaluators || [],
    state_hash: opts.state_hash || (opts.state ? hashDecisionState(opts.state) : null),
    answers: opts.answers || {},
    policy_result: opts.policy_result || null,
    evidence: Array.isArray(opts.evidence) ? opts.evidence : [],
    action: opts.action ?? null,
    outcome: null,
    created_at: new Date().toISOString(),
    why: opts.why || buildWhy(opts.answers, opts.policy_result),
  };
}

/**
 * Attach a consequential outcome to a receipt (pass/fail + human corrections).
 * Passive /why with no correction is NOT treated as a strong correctness label.
 *
 * @param {object} receipt
 * @param {object} outcome
 */
export function appendOutcome(receipt, outcome) {
  if (!receipt || receipt.schema !== DECISION_RECEIPT_SCHEMA) {
    const err = new Error('invalid_receipt');
    err.code = 'invalid_receipt';
    throw err;
  }
  const disposition = normalizeDisposition(outcome);
  const outcome_id = outcome.outcome_id || `out_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const normalized = {
    schema: DECISION_OUTCOME_SCHEMA,
    outcome_id,
    success: outcome.success != null ? Boolean(outcome.success) : disposition === 'accepted' || disposition === 'success',
    disposition,
    human_corrected: Boolean(outcome.human_corrected || disposition === 'overridden' || disposition === 'corrected_to' || disposition === 'user_intervened'),
    corrected_to: outcome.corrected_to ?? null,
    user_override: Boolean(outcome.user_override),
    actual_class: outcome.actual_class ?? null,
    duration_ms: Number.isFinite(Number(outcome.duration_ms)) ? Number(outcome.duration_ms) : null,
    retries: Number.isInteger(outcome.retries) ? outcome.retries : null,
    verification: Array.isArray(outcome.verification) ? outcome.verification : [],
    // Passive acceptance is weak evidence — do not treat as calibrated label
    label_strength: outcome.label_strength
      || (outcome.human_corrected || disposition === 'corrected_to' || disposition === 'overridden'
        ? 'supervised'
        : disposition === 'accepted' && outcome.explicit_accept
          ? 'explicit_accept'
          : 'weak_passive'),
    recorded_at: new Date().toISOString(),
  };
  return {
    ...receipt,
    action_id: outcome.action_id ?? receipt.action_id,
    outcome_id,
    outcome: normalized,
    updated_at: normalized.recorded_at,
  };
}

/**
 * Link an executed action onto a receipt before outcome is known.
 */
export function attachAction(receipt, action = {}) {
  if (!receipt || receipt.schema !== DECISION_RECEIPT_SCHEMA) {
    const err = new Error('invalid_receipt');
    err.code = 'invalid_receipt';
    throw err;
  }
  const action_id = action.action_id || `act_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  return {
    ...receipt,
    action_id,
    action: {
      action_id,
      kind: action.kind || null,
      summary: action.summary || null,
      started_at: action.started_at || new Date().toISOString(),
      ...action,
    },
    updated_at: new Date().toISOString(),
  };
}

function normalizeDisposition(outcome = {}) {
  if (outcome.disposition && OUTCOME_DISPOSITIONS.includes(outcome.disposition)) {
    return outcome.disposition;
  }
  if (outcome.human_corrected && outcome.corrected_to != null) return 'corrected_to';
  if (outcome.user_override) return 'overridden';
  if (outcome.success === true) return 'accepted';
  if (outcome.success === false) return 'failure';
  return 'accepted';
}

function buildWhy(answers = {}, policy = null) {
  const decisions = Object.entries(answers).map(([id, a]) => ({
    id,
    type: a.type,
    value: a.value,
    support: a.support ?? null,
    confidence_estimate: a.confidence_estimate ?? null,
  }));
  return {
    surface: 'agentsam.why.v1',
    decisions,
    policy: policy
      ? {
          allowed: policy.allowed,
          require_approval: policy.require_approval,
          authorization_source: policy.authorization_source,
        }
      : null,
  };
}
