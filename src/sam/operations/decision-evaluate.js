import { defineSamOperation } from '../define.js';
import { evaluate } from '../decision/evaluate.js';
import { getRegisteredQuestion, listRegisteredQuestions } from '../decision/questions.js';

export const decisionEvaluateOp = defineSamOperation({
  id: 'decision.evaluate',
  version: 1,
  module: 'decision',
  action: 'evaluate',
  summary: 'Evaluate choose/score/check questions against a SAM decision state.',
  purpose:
    'Run a batch of independent typed decision questions against one explicit state.',
  outcome:
    'Return answers, routing, policy result, and an optional decision receipt (/why-compatible).',
  description:
    'Systematic Autonomous Machinery decision layer. Prefer deterministic evaluators; semantic evaluators never invent calibrated probabilities.',
  skill: { id: 'agentsam-app-fundamentals', help: true },
  execution: {
    lanes: ['local', 'remote', 'sandbox'],
    model: 'optional',
    embedding: 'never',
    network: 'optional',
    sideEffects: 'none',
    provider_spend: 'possible',
  },
  risk: 'read_only',
  capabilities: ['decision.evaluate', 'planning.goap'],
  artifacts: ['decision.evaluation', 'decision.receipt'],
  cli: { command: [] },
  docs: { section: 'Decision', examples: ['decision-evaluate-terminal'] },
  status: 'stable',
  async handler(input = {}, ctx = {}) {
    const questions = Array.isArray(input.questions)
      ? input.questions.map((q) => {
          if (typeof q === 'string') return getRegisteredQuestion(q, input.overrides?.[q] || {});
          if (q && typeof q === 'object' && typeof q.id === 'string' && !q.type) {
            return getRegisteredQuestion(q.id, q);
          }
          return q;
        })
      : listRegisteredQuestions().slice(0, 0);

    if (!questions.length) {
      const err = new Error('decision.evaluate requires questions[]');
      err.code = 'invalid_input';
      throw err;
    }

    return evaluate({
      state: input.state || {},
      questions,
      policy: input.policy || {},
      receipt: input.receipt !== false,
      action: input.action,
      evaluators: input.evaluators,
      signal: ctx.signal,
    });
  },
});
