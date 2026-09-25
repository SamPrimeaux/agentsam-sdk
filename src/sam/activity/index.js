/**
 * AgentSam activity event stream — one run, many surfaces (Studio / CLI / desktop).
 * Scene/status/progress come ONLY from these events — never demo timers.
 */

export const ACTIVITY_SCHEMA = 'agentsam.activity.v1';

export const ACTIVITY_PHASES = Object.freeze([
  'boot',
  'observe',
  'context',
  'plan',
  'execute',
  'verify',
  'compact',
  'waiting',
  'recover',
  'complete',
]);

export const ACTIVITY_EVENTS = Object.freeze([
  'run.started',
  'phase.changed',
  'step.started',
  'step.progress',
  'step.completed',
  'decision.made',
  'tool.started',
  'tool.completed',
  'artifact.created',
  'file.changed',
  'approval.required',
  'input.required',
  'verification.completed',
  'run.failed',
  'run.completed',
]);

/** User-facing labels — never expose choose/score/check as primary copy. */
export const DECISION_ACTIVITY_LABELS = Object.freeze({
  terminal_lane: 'Selecting execution path',
  retrieval_mode: 'Choosing retrieval path',
  change_risk: 'Assessing change risk',
  requires_approval: 'Checking approval requirements',
  security_review_required: 'Checking security review requirements',
  verification_scope: 'Selecting verification scope',
  skill_candidate: 'Selecting skill',
});

/**
 * @param {object} partial
 */
export function createActivityEvent(partial = {}) {
  const phase = partial.phase || 'execute';
  const event = partial.event || 'step.progress';
  if (!ACTIVITY_PHASES.includes(phase)) {
    const err = new Error(`invalid_activity_phase:${phase}`);
    err.code = 'invalid_activity_phase';
    throw err;
  }
  if (!ACTIVITY_EVENTS.includes(event)) {
    const err = new Error(`invalid_activity_event:${event}`);
    err.code = 'invalid_activity_event';
    throw err;
  }
  return Object.freeze({
    schema: ACTIVITY_SCHEMA,
    run_id: String(partial.run_id || ''),
    seq: Number.isInteger(partial.seq) ? partial.seq : 0,
    timestamp: partial.timestamp || new Date().toISOString(),
    phase,
    event,
    step_id: partial.step_id ?? null,
    parent_id: partial.parent_id ?? null,
    label: String(partial.label || ''),
    detail: partial.detail ?? null,
    progress: normalizeProgress(partial.progress),
    source: partial.source
      ? {
          kind: partial.source.kind || 'sam',
          name: partial.source.name ?? null,
        }
      : { kind: 'sam', name: null },
    evidence: partial.evidence && typeof partial.evidence === 'object'
      ? { ...partial.evidence }
      : null,
  });
}

function normalizeProgress(progress) {
  if (progress == null) return null;
  if (typeof progress !== 'object') return null;
  const current = Number(progress.current);
  const total = Number(progress.total);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  return { current, total };
}

/**
 * Map a decision answer to a user-visible activity event (primitives stay in evidence).
 * @param {object} opts
 */
export function activityFromDecision(opts = {}) {
  const questionId = opts.question_id || opts.answer?.question_id;
  const answer = opts.answer || {};
  const label = DECISION_ACTIVITY_LABELS[questionId]
    || opts.label
    || 'Making a structured decision';
  const valueText = formatAnswerValue(answer);
  return createActivityEvent({
    run_id: opts.run_id,
    seq: opts.seq,
    phase: opts.phase || 'plan',
    event: 'decision.made',
    step_id: opts.step_id ?? null,
    label,
    detail: valueText,
    source: { kind: 'sam', name: answer.evaluator?.kind || 'decision' },
    evidence: {
      decision_id: opts.decision_id ?? null,
      question_id: questionId,
      question_type: answer.type ?? null,
      value: answer.value ?? null,
      confidence_estimate: answer.confidence_estimate ?? null,
      support: answer.support ?? null,
      receipt_id: opts.decision_id ?? null,
    },
  });
}

function formatAnswerValue(answer) {
  if (!answer || answer.value == null) return null;
  if (answer.type === 'check') return answer.value ? 'Required' : 'Not required';
  if (answer.type === 'score') {
    const n = Number(answer.value);
    return Number.isFinite(n) ? (n < 2 ? 'Bounded' : n < 3.5 ? 'Elevated' : 'High') : String(answer.value);
  }
  return String(answer.value);
}

/**
 * In-memory run activity store — Studio SideStage and CLI subscribe to the same seq stream.
 */
export function createActivityStore(runId) {
  const id = String(runId || `run_${Date.now().toString(36)}`);
  /** @type {object[]} */
  const events = [];
  /** @type {Set<(e: object) => void>} */
  const listeners = new Set();
  let seq = 0;

  function emit(partial) {
    const event = createActivityEvent({
      ...partial,
      run_id: id,
      seq: ++seq,
    });
    events.push(event);
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        /* subscriber errors must not break the run */
      }
    }
    return event;
  }

  return {
    run_id: id,
    emit,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    snapshot() {
      return [...events];
    },
    latest() {
      return events[events.length - 1] || null;
    },
  };
}
