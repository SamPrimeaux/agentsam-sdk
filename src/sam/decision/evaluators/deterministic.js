/**
 * Deterministic evaluator — exact facts / policy / registry lookups.
 * Never invents semantic judgments.
 */

import { buildAnswer, concentrationFromScores, clamp01 } from '../confidence.js';

export const DETERMINISTIC_EVALUATOR = Object.freeze({
  kind: 'deterministic',
  version: '1',

  /**
   * @param {object} question
   */
  supports(question) {
    if (!question) return false;
    if ([
      'terminal_lane',
      'requires_approval',
      'security_review_required',
      'verification_scope',
      'retrieval_mode',
      'change_risk',
      'skill_candidate',
    ].includes(question.id)) {
      return true;
    }
    // Fact-backed generic choose/check — selection still requires state facts at evaluate time.
    if (question.evaluator_hint === 'deterministic' && (question.type === 'choose' || question.type === 'check')) {
      return true;
    }
    return false;
  },

  /**
   * @param {object} state
   * @param {object[]} questions
   */
  async evaluate(state, questions) {
    /** @type {Record<string, object>} */
    const answers = {};
    for (const q of questions) {
      answers[q.id] = evaluateOne(state, q);
    }
    return {
      ok: true,
      evaluator: { kind: 'deterministic', version: '1' },
      answers,
      model_used: false,
      deterministic: true,
    };
  },
});

function evaluateOne(state, question) {
  switch (question.id) {
    case 'terminal_lane':
      return chooseTerminalLane(state, question);
    case 'retrieval_mode':
      return chooseRetrievalMode(state, question);
    case 'verification_scope':
      return chooseVerificationScope(state, question);
    case 'change_risk':
      return scoreChangeRisk(state, question);
    case 'requires_approval':
      return checkRequiresApproval(state, question);
    case 'security_review_required':
      return checkSecurityReview(state, question);
    case 'skill_candidate':
      return chooseSkillCandidate(state, question);
    default:
      if (question.type === 'choose' && state.facts?.[`choose.${question.id}`]) {
        return fromFactChoose(state, question);
      }
      if (question.type === 'check' && state.facts?.[`check.${question.id}`] != null) {
        return fromFactCheck(state, question);
      }
      {
        const err = new Error(`deterministic_unsupported:${question.id}`);
        err.code = 'evaluator_unsupported';
        throw err;
      }
  }
}

function chooseTerminalLane(state, question) {
  const lanes = state.runtime?.terminal_lanes || {};
  const localOk = lanes.local !== false && lanes.local !== 'unavailable';
  const remoteOk = lanes.remote !== false && lanes.remote !== 'unavailable';
  const sandboxOk = lanes.sandbox !== false && lanes.sandbox !== 'unavailable';
  const isolation = Boolean(state.constraints?.isolation_required || state.facts?.untrusted_code);
  const needsLocal = Boolean(state.constraints?.requires_local_files || state.facts?.requires_local_files);

  /** @type {Record<string, number>} */
  const scores = { local: 0.1, remote: 0.1, sandbox: 0.1 };
  if (isolation && sandboxOk) scores.sandbox += 5;
  if (needsLocal && localOk) scores.local += 5;
  if (!needsLocal && !isolation && localOk) scores.local += 2;
  if (!needsLocal && remoteOk) scores.remote += 1.5;
  if (!localOk) scores.local = 0;
  if (!remoteOk) scores.remote = 0;
  if (!sandboxOk) scores.sandbox = 0;

  const value = argmax(scores);
  return buildAnswer({
    type: 'choose',
    question_id: question.id,
    value,
    scores,
    confidence_estimate: concentrationFromScores(scores),
    // No probabilities — heuristic weights, not a probabilistic model
    evaluator: { kind: 'deterministic', version: '1', rule: 'terminal_lane_v1' },
    evidence: [
      `isolation_required=${isolation}`,
      `requires_local_files=${needsLocal}`,
      `local_ok=${localOk}`,
      `remote_ok=${remoteOk}`,
      `sandbox_ok=${sandboxOk}`,
    ],
  });
}

function chooseRetrievalMode(state, question) {
  const intent = String(state.intent?.type || state.intent || state.facts?.query_kind || '');
  /** @type {Record<string, number>} */
  const scores = {
    ast: 0.2,
    lexical: 0.2,
    semantic: 0.2,
    memory: 0.1,
    web: 0.1,
    none: 0.05,
  };
  if (/symbol|import|definition|call.?graph/i.test(intent)) scores.ast += 4;
  if (/where|file|path|string/i.test(intent)) scores.lexical += 2;
  if (/concept|architecture|why|design/i.test(intent)) scores.semantic += 3;
  if (/last week|history|decision|remember/i.test(intent)) scores.memory += 4;
  if (/cloudflare|provider docs|current support/i.test(intent)) scores.web += 4;
  if (state.facts?.no_retrieval) {
    scores.none += 10;
  }
  const value = argmax(scores);
  return buildAnswer({
    type: 'choose',
    question_id: question.id,
    value,
    scores,
    confidence_estimate: concentrationFromScores(scores),
    evaluator: { kind: 'deterministic', version: '1', rule: 'retrieval_mode_v1' },
    evidence: [`intent=${intent || 'unknown'}`],
  });
}

function chooseVerificationScope(state, question) {
  const packages = state.code?.affected_packages?.length || Number(state.facts?.affected_packages) || 0;
  const risk = Number(state.facts?.change_risk_hint ?? 0);
  /** @type {Record<string, number>} */
  const scores = { focused: 1, package: 1, workspace: 0.5, repository: 0.2 };
  if (packages <= 1 && risk < 2) scores.focused += 3;
  else if (packages <= 3 && risk < 3) scores.package += 3;
  else if (packages <= 8) scores.workspace += 3;
  else scores.repository += 3;
  const value = argmax(scores);
  return buildAnswer({
    type: 'choose',
    question_id: question.id,
    value,
    scores,
    confidence_estimate: concentrationFromScores(scores),
    evaluator: { kind: 'deterministic', version: '1', rule: 'verification_scope_v1' },
    evidence: [`affected_packages=${packages}`, `risk_hint=${risk}`],
  });
}

function scoreChangeRisk(state, question) {
  const levels = question.levels;
  let index = 0;
  const packages = state.code?.affected_packages?.length || 0;
  if (state.facts?.security_boundary || state.facts?.schema_change) index = Math.max(index, 3);
  if (state.facts?.production_sensitive) index = Math.max(index, 4);
  if (packages > 5) index = Math.max(index, 2);
  else if (packages > 1) index = Math.max(index, 1);
  if (state.facts?.runtime_change) index = Math.max(index, 3);
  index = Math.min(index, levels[levels.length - 1].index);

  /** @type {Record<string, number>} */
  const scores = {};
  for (const level of levels) {
    const dist = Math.abs(level.index - index);
    scores[String(level.index)] = Math.max(0.05, 1 / (1 + dist * dist));
  }
  return buildAnswer({
    type: 'score',
    question_id: question.id,
    value: index,
    levels: Object.fromEntries(levels.map((l) => [String(l.index), l.label])),
    scores,
    confidence_estimate: concentrationFromScores(scores),
    evaluator: { kind: 'deterministic', version: '1', rule: 'change_risk_v1' },
    evidence: [
      `packages=${packages}`,
      `security_boundary=${Boolean(state.facts?.security_boundary)}`,
      `schema_change=${Boolean(state.facts?.schema_change)}`,
      `production_sensitive=${Boolean(state.facts?.production_sensitive)}`,
    ],
  });
}

function checkRequiresApproval(state, question) {
  const production = Boolean(
    state.constraints?.production_write
    || state.facts?.production_write
    || state.constraints?.approval === 'always',
  );
  const irreversible = Boolean(state.facts?.irreversible);
  const highRisk = Number(state.facts?.change_risk_hint ?? 0) >= 3;
  const value = production || irreversible || highRisk;
  const support = value ? 0.95 : 0.08;
  return buildAnswer({
    type: 'check',
    question_id: question.id,
    value,
    support: clamp01(support),
    // Explicitly NOT calibrated_probability
    evaluator: { kind: 'deterministic', version: '1', rule: 'requires_approval_v1' },
    evidence: [
      `production_write=${production}`,
      `irreversible=${irreversible}`,
      `high_risk=${highRisk}`,
    ],
  });
}

function checkSecurityReview(state, question) {
  const value = Boolean(
    state.facts?.security_boundary
    || state.facts?.auth_change
    || state.facts?.secret_handling
    || state.constraints?.security === 'review',
  );
  return buildAnswer({
    type: 'check',
    question_id: question.id,
    value,
    support: value ? 0.9 : 0.12,
    evaluator: { kind: 'deterministic', version: '1', rule: 'security_review_v1' },
    evidence: [
      `security_boundary=${Boolean(state.facts?.security_boundary)}`,
      `auth_change=${Boolean(state.facts?.auth_change)}`,
    ],
  });
}

function chooseSkillCandidate(state, question) {
  const options = Array.isArray(question.options) ? question.options : [];
  if (!options.length) {
    const err = new Error('skill_candidate_requires_options');
    err.code = 'invalid_question';
    throw err;
  }
  const intent = String(state.intent?.text || state.intent?.type || state.intent || '').toLowerCase();
  const tags = Array.isArray(state.facts?.intent_tags)
    ? state.facts.intent_tags.map((t) => String(t).toLowerCase())
    : intent.split(/\W+/).filter(Boolean);
  const criteria = question.criteria && typeof question.criteria === 'object' ? question.criteria : {};
  const skills = state.skills && typeof state.skills === 'object' ? state.skills : {};

  /** @type {Record<string, number>} */
  const scores = {};
  for (const opt of options) {
    let score = 0.1;
    const def = criteria[opt] || skills[opt] || {};
    const hay = [
      opt,
      def.label,
      def.description,
      ...(Array.isArray(def.tags) ? def.tags : []),
      ...(Array.isArray(def.use_when) ? def.use_when : []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    for (const tag of tags) {
      if (tag.length >= 3 && hay.includes(tag)) score += 1.5;
    }
    if (intent && hay && intent.split(/\s+/).some((w) => w.length >= 4 && hay.includes(w))) {
      score += 2;
    }
    scores[opt] = score;
  }
  const value = argmax(scores);
  return buildAnswer({
    type: 'choose',
    question_id: question.id,
    value,
    scores,
    confidence_estimate: concentrationFromScores(scores),
    evaluator: { kind: 'deterministic', version: '1', rule: 'skill_candidate_v1' },
    evidence: [`intent=${intent || 'unknown'}`, `candidates=${options.join(',')}`],
  });
}

function fromFactChoose(state, question) {
  const value = state.facts[`choose.${question.id}`];
  /** @type {Record<string, number>} */
  const scores = {};
  for (const opt of question.options) scores[opt] = opt === value ? 1 : 0;
  return buildAnswer({
    type: 'choose',
    question_id: question.id,
    value,
    scores,
    confidence_estimate: 1,
    evaluator: { kind: 'deterministic', version: '1', rule: 'fact_choose' },
    evidence: [`fact=choose.${question.id}`],
  });
}

function fromFactCheck(state, question) {
  const value = Boolean(state.facts[`check.${question.id}`]);
  return buildAnswer({
    type: 'check',
    question_id: question.id,
    value,
    support: value ? 1 : 0,
    evaluator: { kind: 'deterministic', version: '1', rule: 'fact_check' },
    evidence: [`fact=check.${question.id}`],
  });
}

function argmax(scores) {
  let best = null;
  let bestV = -Infinity;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestV || (v === bestV && (best == null || k < best))) {
      best = k;
      bestV = v;
    }
  }
  return best;
}
