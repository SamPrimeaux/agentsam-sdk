/**
 * SAM decision contracts — Systematic Autonomous Machinery.
 * choose / score / check — AgentSam-native, no vendor terminology.
 */

export const DECISION_STATE_SCHEMA = 'agentsam.decision-state.v1';
export const DECISION_QUESTION_SCHEMA = 'agentsam.decision-question.v1';
export const DECISION_ANSWER_SCHEMA = 'agentsam.decision-answer.v1';
export const DECISION_EVALUATION_SCHEMA = 'agentsam.decision-evaluation.v1';
export const DECISION_RECEIPT_SCHEMA = 'agentsam.decision-receipt.v1';
export const DECISION_OUTCOME_SCHEMA = 'agentsam.decision-outcome.v1';
export const DECISION_CALIBRATION_SCHEMA = 'agentsam.decision-calibration.v1';

/** @typedef {'choose'|'score'|'check'} QuestionType */
/** @typedef {'deterministic'|'heuristic'|'graph'|'semantic'|'calibrated-statistical'} EvaluatorKind */

/**
 * Confidence semantics:
 * - confidence_estimate / support: raw evaluator concentration or proposition support
 * - probabilities: ONLY when evaluator has a defined probabilistic interpretation
 * - calibrated_probability: ONLY after empirical calibration with calibration_id
 */
