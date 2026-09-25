/**
 * Evaluator selection — cheapest reliable evaluator first.
 * Deterministic facts MUST NOT silently fall through to semantic.
 */

import { DETERMINISTIC_EVALUATOR } from './deterministic.js';
import { HEURISTIC_EVALUATOR } from './heuristic.js';
import { SEMANTIC_EVALUATOR } from './semantic.js';

const DEFAULT_CHAIN = [DETERMINISTIC_EVALUATOR, HEURISTIC_EVALUATOR, SEMANTIC_EVALUATOR];

/**
 * @param {object} question
 * @param {object[]} [evaluators]
 */
export function selectEvaluator(question, evaluators = DEFAULT_CHAIN) {
  if (question.evaluator_hint === 'semantic') {
    const semantic = evaluators.find((e) => e.kind === 'semantic');
    if (!semantic?.supports(question)) {
      const err = new Error('semantic_evaluator_required_but_unavailable');
      err.code = 'evaluator_unavailable';
      throw err;
    }
    return semantic;
  }
  if (question.evaluator_hint === 'heuristic') {
    const heuristic = evaluators.find((e) => e.kind === 'heuristic');
    if (!heuristic?.supports(question)) {
      const err = new Error('heuristic_evaluator_required_but_unavailable');
      err.code = 'evaluator_unavailable';
      throw err;
    }
    return heuristic;
  }
  if (question.evaluator_hint === 'deterministic' || !question.evaluator_hint) {
    for (const ev of evaluators) {
      if (ev.kind === 'semantic') continue; // never silent semantic fallback
      if (ev.supports(question)) return ev;
    }
  }
  for (const ev of evaluators) {
    if (ev.kind === 'semantic') continue;
    if (ev.supports(question)) return ev;
  }
  const err = new Error(`no_evaluator_for:${question.id}`);
  err.code = 'evaluator_unsupported';
  throw err;
}

export { DETERMINISTIC_EVALUATOR, HEURISTIC_EVALUATOR, SEMANTIC_EVALUATOR, DEFAULT_CHAIN };
