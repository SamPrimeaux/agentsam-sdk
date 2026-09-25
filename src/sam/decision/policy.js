/**
 * Policy owns permission — scores/confidence never grant authority alone.
 */

/**
 * @param {object} opts
 * @param {Record<string, object>} opts.answers
 * @param {object} [opts.policy]
 * @param {object} [opts.state]
 */
export function applyDecisionPolicy(opts = {}) {
  const answers = opts.answers || {};
  const policy = opts.policy || {};
  const state = opts.state || {};
  const required = [];
  const denied = [];
  const notes = [];

  // Hard policy: production writes always require approval regardless of check support.
  if (
    policy.production_database_write === 'ALWAYS_REQUIRE_APPROVAL'
    || state.constraints?.production_write
    || state.facts?.production_write
  ) {
    required.push('user_approval');
    notes.push('policy:production_write_always_requires_approval');
  }

  const approvalAnswer = answers.requires_approval;
  if (approvalAnswer?.type === 'check' && approvalAnswer.value === true) {
    required.push('user_approval');
  }

  // High confidence NEVER authorizes by itself.
  for (const [id, answer] of Object.entries(answers)) {
    if (
      answer?.confidence_estimate != null
      && answer.confidence_estimate >= 0.95
      && policy.confidence_grants_authority
    ) {
      notes.push(`ignored_confidence_authority_claim:${id}`);
    }
  }

  if (policy.deny_sandbox && answers.terminal_lane?.value === 'sandbox') {
    denied.push('terminal_lane:sandbox');
  }

  const allowed = denied.length === 0;
  return {
    allowed,
    require_approval: required.includes('user_approval'),
    required: [...new Set(required)],
    denied,
    notes,
    // Explicit: confidence is not permission
    authorization_source: 'policy',
  };
}

/**
 * Composite utility from separate score/check answers — weights live in code.
 * @param {object} parts
 * @param {object} [weights]
 */
export function composeUtility(parts = {}, weights = {}) {
  const w = {
    goal_progress: weights.goal_progress ?? 0.4,
    reversibility: weights.reversibility ?? 0.15,
    risk: weights.risk ?? 0.25,
    cost: weights.cost ?? 0.1,
    confidence: weights.confidence ?? 0.1,
  };
  const goal = Number(parts.goal_progress ?? 0);
  const rev = Number(parts.reversibility ?? 0);
  const risk = Number(parts.risk ?? 0);
  const cost = Number(parts.cost ?? 0);
  const conf = Number(parts.confidence ?? 0);
  return (
    goal * w.goal_progress
    + rev * w.reversibility
    + conf * w.confidence
    - risk * w.risk
    - cost * w.cost
  );
}
