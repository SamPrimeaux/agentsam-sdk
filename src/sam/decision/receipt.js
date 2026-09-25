/**
 * Decision receipts + outcome reconciliation.
 */

import { randomUUID } from 'node:crypto';
import { DECISION_RECEIPT_SCHEMA, DECISION_OUTCOME_SCHEMA } from './types.js';
import { hashDecisionState } from './state.js';

/**
 * @param {object} opts
 */
export function createDecisionReceipt(opts = {}) {
  return {
    schema: DECISION_RECEIPT_SCHEMA,
    decision_id: opts.decision_id || `dec_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
    question_contract: opts.question_contract || null,
    question_ids: Array.isArray(opts.question_ids) ? opts.question_ids : [],
    question_versions: opts.question_versions || {},
    evaluator: opts.evaluator || null,
    evaluators: opts.evaluators || [],
    state_hash: opts.state_hash || (opts.state ? hashDecisionState(opts.state) : null),
    answers: opts.answers || {},
    policy_result: opts.policy_result || null,
    action: opts.action ?? null,
    outcome: null,
    created_at: new Date().toISOString(),
    why: opts.why || buildWhy(opts.answers, opts.policy_result),
  };
}

/**
 * @param {object} receipt
 * @param {object} outcome
 */
export function appendOutcome(receipt, outcome) {
  if (!receipt || receipt.schema !== DECISION_RECEIPT_SCHEMA) {
    const err = new Error('invalid_receipt');
    err.code = 'invalid_receipt';
    throw err;
  }
  const normalized = {
    schema: DECISION_OUTCOME_SCHEMA,
    success: Boolean(outcome.success),
    human_corrected: Boolean(outcome.human_corrected),
    actual_class: outcome.actual_class ?? null,
    verification: Array.isArray(outcome.verification) ? outcome.verification : [],
    recorded_at: new Date().toISOString(),
  };
  return {
    ...receipt,
    outcome: normalized,
    updated_at: normalized.recorded_at,
  };
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
