/**
 * Question builders + validation for choose / score / check.
 */

import { DECISION_QUESTION_SCHEMA } from './types.js';

/**
 * @param {object} def
 */
export function defineChoose(def) {
  return validateQuestion({
    schema: DECISION_QUESTION_SCHEMA,
    id: def.id,
    type: 'choose',
    version: def.version ?? 1,
    instructions: def.instructions ?? null,
    criteria: def.criteria ?? null,
    options: def.options,
    evaluator_hint: def.evaluator_hint ?? null,
  });
}

/**
 * @param {object} def
 */
export function defineScore(def) {
  return validateQuestion({
    schema: DECISION_QUESTION_SCHEMA,
    id: def.id,
    type: 'score',
    version: def.version ?? 1,
    instructions: def.instructions ?? null,
    criteria: def.criteria ?? null,
    levels: def.levels,
    evaluator_hint: def.evaluator_hint ?? null,
  });
}

/**
 * @param {object} def
 */
export function defineCheck(def) {
  return validateQuestion({
    schema: DECISION_QUESTION_SCHEMA,
    id: def.id,
    type: 'check',
    version: def.version ?? 1,
    instructions: def.instructions ?? null,
    criteria: def.criteria ?? null,
    evaluator_hint: def.evaluator_hint ?? null,
  });
}

/**
 * Fail-closed validation.
 * @param {object} question
 */
export function validateQuestion(question) {
  if (!question || typeof question !== 'object') {
    throw fail('invalid_question', 'question must be an object');
  }
  if (typeof question.id !== 'string' || !question.id.trim()) {
    throw fail('invalid_question_id', 'question.id is required');
  }
  if (!['choose', 'score', 'check'].includes(question.type)) {
    throw fail('invalid_question_type', `unsupported type: ${question.type}`);
  }
  if (question.instructions != null && !isAllowedInstructions(question.instructions)) {
    throw fail('invalid_instructions', 'instructions must be string|object|array|null');
  }
  if (question.criteria != null && !isAllowedCriteria(question.criteria)) {
    throw fail('invalid_criteria', 'criteria must be string|object|array|null');
  }

  if (question.type === 'choose') {
    const options = normalizeOptions(question.options, question.criteria);
    if (!options.length) {
      throw fail('choose_options_required', 'choose requires a finite options set');
    }
    return Object.freeze({
      ...question,
      schema: DECISION_QUESTION_SCHEMA,
      options,
      version: question.version ?? 1,
    });
  }

  if (question.type === 'score') {
    const levels = normalizeLevels(question.levels ?? question.criteria);
    if (levels.length < 2) {
      throw fail('score_levels_required', 'score requires an ordered levels list (>=2)');
    }
    // Ensure strictly ordered by numeric index (and unique)
    const seen = new Set();
    for (let i = 0; i < levels.length; i += 1) {
      if (seen.has(levels[i].index)) {
        throw fail('score_levels_unordered', 'score levels must have unique strictly increasing indexes');
      }
      seen.add(levels[i].index);
      if (i > 0 && !(levels[i].index > levels[i - 1].index)) {
        throw fail('score_levels_unordered', 'score levels must be strictly increasing');
      }
    }
    return Object.freeze({
      ...question,
      schema: DECISION_QUESTION_SCHEMA,
      levels,
      version: question.version ?? 1,
    });
  }

  // check — single proposition; do not smuggle multi-dimensional scoring
  return Object.freeze({
    ...question,
    schema: DECISION_QUESTION_SCHEMA,
    version: question.version ?? 1,
  });
}

/**
 * @param {object[]} questions
 */
export function validateQuestionBatch(questions) {
  if (!Array.isArray(questions) || !questions.length) {
    throw fail('empty_batch', 'questions must be a non-empty array');
  }
  const ids = new Set();
  const validated = questions.map((q) => validateQuestion(q));
  for (const q of validated) {
    if (ids.has(q.id)) throw fail('duplicate_question_id', `duplicate question id: ${q.id}`);
    ids.add(q.id);
  }
  return validated;
}

function normalizeOptions(options, criteria) {
  if (Array.isArray(options)) {
    return options.map((o) => {
      if (typeof o === 'string') return o;
      if (o && typeof o === 'object' && typeof o.id === 'string') return o.id;
      throw fail('invalid_option', 'choose options must be strings or {id}');
    });
  }
  if (criteria && typeof criteria === 'object' && !Array.isArray(criteria)) {
    return Object.keys(criteria);
  }
  return [];
}

function normalizeLevels(levels) {
  if (Array.isArray(levels)) {
    return levels.map((level, i) => {
      if (typeof level === 'string') return { index: i, label: level };
      if (level && typeof level === 'object') {
        const index = Number(level.index ?? level.value ?? i);
        if (!Number.isFinite(index)) throw fail('invalid_level_index', 'level index must be numeric');
        return {
          index,
          label: String(level.label ?? level.description ?? `level_${index}`),
          description: level.description ?? null,
        };
      }
      throw fail('invalid_level', 'score level must be string or object');
    }).sort((a, b) => a.index - b.index);
  }
  if (levels && typeof levels === 'object') {
    return Object.keys(levels)
      .map((k) => {
        const index = Number(k);
        if (!Number.isFinite(index)) throw fail('invalid_level_key', 'object level keys must be numeric');
        const v = levels[k];
        return {
          index,
          label: typeof v === 'string' ? v : String(v?.label ?? k),
          description: typeof v === 'object' ? v.description ?? null : null,
        };
      })
      .sort((a, b) => a.index - b.index);
  }
  return [];
}

function isAllowedInstructions(value) {
  return (
    value === null
    || typeof value === 'string'
    || Array.isArray(value)
    || (typeof value === 'object')
  );
}

function isAllowedCriteria(value) {
  return isAllowedInstructions(value);
}

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}
