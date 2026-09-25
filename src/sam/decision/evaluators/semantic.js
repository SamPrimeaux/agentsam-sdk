/**
 * Semantic evaluator — optional LLM path via existing AgentSam model routing.
 * Numbers from this evaluator are confidence_estimate / support only —
 * NEVER labeled calibrated_probability without calibration_id.
 */

import { buildAnswer, concentrationFromScores, clamp01, softmax } from '../confidence.js';

export function createSemanticEvaluator(options = {}) {
  const complete = options.complete;

  return Object.freeze({
    kind: 'semantic',
    version: '1',

    supports(question) {
      return question?.evaluator_hint === 'semantic';
    },

    async evaluate(state, questions) {
      if (typeof complete !== 'function') {
        const err = new Error('semantic_evaluator_unconfigured');
        err.code = 'evaluator_unavailable';
        throw err;
      }

      /** @type {Record<string, object>} */
      const answers = {};
      for (const q of questions) {
        const prompt = buildPrompt(state, q);
        const raw = await complete({ prompt, question: q, state });
        answers[q.id] = normalizeSemanticAnswer(q, raw);
      }
      return {
        ok: true,
        evaluator: { kind: 'semantic', version: '1' },
        answers,
        model_used: true,
        deterministic: false,
      };
    },
  });
}

function buildPrompt(state, question) {
  return {
    question_id: question.id,
    type: question.type,
    instructions: question.instructions,
    criteria: question.criteria,
    options: question.options,
    levels: question.levels,
    state_facts: state.facts || {},
    intent: state.intent,
  };
}

function normalizeSemanticAnswer(question, raw) {
  const warnings = ['semantic_values_are_estimates_not_calibrated_probabilities'];
  if (!raw || typeof raw !== 'object') {
    const err = new Error('semantic_answer_invalid');
    err.code = 'evaluator_failed';
    throw err;
  }

  if (question.type === 'choose') {
    const value = String(raw.value ?? raw.choice ?? '');
    if (!question.options.includes(value)) {
      const err = new Error(`semantic_choice_not_in_options:${value}`);
      err.code = 'evaluator_failed';
      throw err;
    }
    const scores = raw.scores && typeof raw.scores === 'object'
      ? Object.fromEntries(question.options.map((o) => [o, Number(raw.scores[o]) || 0]))
      : Object.fromEntries(question.options.map((o) => [o, o === value ? 1 : 0]));
    return buildAnswer({
      type: 'choose',
      question_id: question.id,
      value,
      scores,
      confidence_estimate: Number.isFinite(Number(raw.confidence_estimate))
        ? clamp01(Number(raw.confidence_estimate))
        : concentrationFromScores(scores),
      // Explicitly omit probabilities unless caller marks probabilistic=true AND supplies dist
      probabilities: raw.probabilistic === true && raw.probabilities
        ? raw.probabilities
        : null,
      evaluator: { kind: 'semantic', version: '1' },
      warnings,
      evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    });
  }

  if (question.type === 'score') {
    let value = Number(raw.value);
    const scores = raw.scores && typeof raw.scores === 'object'
      ? Object.fromEntries(question.levels.map((l) => [String(l.index), Number(raw.scores[l.index] ?? raw.scores[String(l.index)]) || 0]))
      : null;
    if (raw.probabilistic === true && raw.probabilities) {
      const probs = Object.fromEntries(
        question.levels.map((l) => [String(l.index), Number(raw.probabilities[l.index] ?? raw.probabilities[String(l.index)]) || 0]),
      );
      value = question.levels.reduce((n, l) => n + l.index * (probs[String(l.index)] || 0), 0);
      return buildAnswer({
        type: 'score',
        question_id: question.id,
        value,
        levels: Object.fromEntries(question.levels.map((l) => [String(l.index), l.label])),
        scores: scores || probs,
        probabilities: probs,
        confidence_estimate: concentrationFromScores(probs),
        evaluator: { kind: 'semantic', version: '1' },
        warnings,
      });
    }
    if (!Number.isFinite(value)) {
      const err = new Error('semantic_score_invalid');
      err.code = 'evaluator_failed';
      throw err;
    }
    return buildAnswer({
      type: 'score',
      question_id: question.id,
      value,
      levels: Object.fromEntries(question.levels.map((l) => [String(l.index), l.label])),
      scores: scores || softmax(Object.fromEntries(question.levels.map((l) => [String(l.index), -Math.abs(l.index - value)]))),
      confidence_estimate: Number.isFinite(Number(raw.confidence_estimate))
        ? clamp01(Number(raw.confidence_estimate))
        : 0.5,
      evaluator: { kind: 'semantic', version: '1' },
      warnings,
    });
  }

  // check
  const support = clamp01(Number(raw.support ?? raw.confidence_estimate ?? (raw.value ? 0.8 : 0.2)));
  return buildAnswer({
    type: 'check',
    question_id: question.id,
    value: Boolean(raw.value ?? support >= 0.5),
    support,
    evaluator: { kind: 'semantic', version: '1' },
    warnings,
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
  });
}

/** Default unconfigured instance — fails closed. */
export const SEMANTIC_EVALUATOR = createSemanticEvaluator();
