/**
 * Initial AgentSam decision question registry.
 */

import { defineChoose, defineScore, defineCheck } from './validate.js';

export const QUESTION_REGISTRY = Object.freeze({
  terminal_lane: defineChoose({
    id: 'terminal_lane',
    version: 1,
    evaluator_hint: 'deterministic',
    instructions: {
      question: 'Which execution lane best fits this task?',
      focus: 'Use isolation, repository locality, availability and cost.',
    },
    criteria: {
      local: {
        use_when: ['task requires unsynced local files', 'local terminal healthy'],
        avoid_when: ['strong isolation required'],
      },
      remote: {
        use_when: ['shared remote environment needed'],
        avoid_when: ['requires local-only paths'],
      },
      sandbox: {
        use_when: ['code is untrusted', 'strong isolation is required'],
        avoid_when: ['task requires direct access to unsynced local files'],
      },
    },
    options: ['local', 'remote', 'sandbox'],
  }),

  retrieval_mode: defineChoose({
    id: 'retrieval_mode',
    version: 1,
    evaluator_hint: 'deterministic',
    instructions: 'Which retrieval corpus should SAM query first?',
    options: ['ast', 'lexical', 'semantic', 'memory', 'web', 'none'],
    criteria: {
      ast: { use_when: ['symbol / import / call-graph questions'] },
      lexical: { use_when: ['exact string / path lookup'] },
      semantic: { use_when: ['architectural concept questions'] },
      memory: { use_when: ['historical decisions'] },
      web: { use_when: ['fresh provider docs'] },
      none: { use_when: ['no retrieval needed'] },
    },
  }),

  change_risk: defineScore({
    id: 'change_risk',
    version: 1,
    evaluator_hint: 'deterministic',
    instructions: 'How much operational risk does this proposed change carry?',
    levels: [
      { index: 0, label: 'Local, reversible change with no runtime impact' },
      { index: 1, label: 'Bounded implementation change with focused verification' },
      { index: 2, label: 'Cross-package change with known consumers' },
      { index: 3, label: 'Runtime/schema/security boundary change' },
      { index: 4, label: 'High-blast-radius or production-sensitive change' },
    ],
  }),

  requires_approval: defineCheck({
    id: 'requires_approval',
    version: 1,
    evaluator_hint: 'deterministic',
    instructions: {
      question: 'Does this action require explicit user approval?',
      inspect: ['action.reversibility', 'action.production_effect', 'policy'],
    },
  }),

  security_review_required: defineCheck({
    id: 'security_review_required',
    version: 1,
    evaluator_hint: 'deterministic',
    instructions: {
      question: 'Does this change require a security review before merge?',
      inspect: ['security_boundary', 'auth_change', 'secret_handling'],
    },
  }),

  verification_scope: defineChoose({
    id: 'verification_scope',
    version: 1,
    evaluator_hint: 'deterministic',
    instructions: 'How broad should verification be for this change?',
    options: ['focused', 'package', 'workspace', 'repository'],
  }),
});

/**
 * @param {string} id
 * @param {object} [overrides] e.g. dynamic options for skill_candidate
 */
export function getRegisteredQuestion(id, overrides = {}) {
  if (id === 'skill_candidate') {
    const options = Array.isArray(overrides.options) ? overrides.options : [];
    return defineChoose({
      id: 'skill_candidate',
      version: 1,
      evaluator_hint: overrides.evaluator_hint || 'deterministic',
      instructions: overrides.instructions || 'Which skill best fits this task from the retrieved candidates?',
      options,
      criteria: overrides.criteria || null,
    });
  }
  const base = QUESTION_REGISTRY[id];
  if (!base) {
    const err = new Error(`unknown_question:${id}`);
    err.code = 'unknown_question';
    throw err;
  }
  if (!Object.keys(overrides).length) return base;
  return { ...base, ...overrides, id: base.id, type: base.type };
}

export function listRegisteredQuestions() {
  return Object.keys(QUESTION_REGISTRY);
}
