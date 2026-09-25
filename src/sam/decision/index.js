/**
 * SAM decision module — choose / score / check + batch evaluate.
 */

export {
  DECISION_STATE_SCHEMA,
  DECISION_QUESTION_SCHEMA,
  DECISION_ANSWER_SCHEMA,
  DECISION_EVALUATION_SCHEMA,
  DECISION_RECEIPT_SCHEMA,
  DECISION_OUTCOME_SCHEMA,
  DECISION_CALIBRATION_SCHEMA,
} from './types.js';

export { buildDecisionState, hashDecisionState, projectState } from './state.js';
export {
  defineChoose,
  defineScore,
  defineCheck,
  validateQuestion,
  validateQuestionBatch,
} from './validate.js';
export {
  concentrationFromScores,
  softmax,
  expectedScore,
  assertProbabilitiesSumToOne,
  buildAnswer,
  clamp01,
} from './confidence.js';
export { evaluate, evaluateDependentStages } from './evaluate.js';
export { applyDecisionPolicy, composeUtility } from './policy.js';
export { createDecisionReceipt, appendOutcome, attachAction, OUTCOME_DISPOSITIONS } from './receipt.js';
export {
  brierScore,
  logLoss,
  expectedCalibrationError,
  exportCalibrationDataset,
} from './calibration.js';
export {
  QUESTION_REGISTRY,
  getRegisteredQuestion,
  listRegisteredQuestions,
} from './questions.js';
export {
  selectEvaluator,
  DETERMINISTIC_EVALUATOR,
  HEURISTIC_EVALUATOR,
  SEMANTIC_EVALUATOR,
  DEFAULT_CHAIN,
} from './evaluators/select.js';
export { createSemanticEvaluator } from './evaluators/semantic.js';
export { hierarchicalChoose, beamRetain } from './hierarchical.js';
