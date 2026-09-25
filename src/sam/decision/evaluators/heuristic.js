/**
 * Heuristic evaluator — explicit utility formulas over state facts.
 */

import { buildAnswer, concentrationFromScores, clamp01 } from '../confidence.js';

export const HEURISTIC_EVALUATOR = Object.freeze({
  kind: 'heuristic',
  version: '1',

  supports(question) {
    return question?.evaluator_hint === 'heuristic';
  },

  async evaluate(state, questions) {
    /** @type {Record<string, object>} */
    const answers = {};
    for (const q of questions) {
      if (q.type === 'score' && typeof state.facts?.[`score.${q.id}`] === 'number') {
        const value = Number(state.facts[`score.${q.id}`]);
        /** @type {Record<string, number>} */
        const scores = {};
        for (const level of q.levels) {
          const dist = Math.abs(level.index - value);
          scores[String(level.index)] = Math.max(0.01, 1 / (1 + dist));
        }
        answers[q.id] = buildAnswer({
          type: 'score',
          question_id: q.id,
          value,
          levels: Object.fromEntries(q.levels.map((l) => [String(l.index), l.label])),
          scores,
          confidence_estimate: concentrationFromScores(scores),
          evaluator: { kind: 'heuristic', version: '1' },
        });
        continue;
      }
      if (q.type === 'check' && typeof state.facts?.[`support.${q.id}`] === 'number') {
        const support = clamp01(Number(state.facts[`support.${q.id}`]));
        answers[q.id] = buildAnswer({
          type: 'check',
          question_id: q.id,
          value: support >= 0.5,
          support,
          evaluator: { kind: 'heuristic', version: '1' },
        });
        continue;
      }
      const err = new Error(`heuristic_unsupported:${q.id}`);
      err.code = 'evaluator_unsupported';
      throw err;
    }
    return {
      ok: true,
      evaluator: { kind: 'heuristic', version: '1' },
      answers,
      model_used: false,
      deterministic: true,
    };
  },
});
