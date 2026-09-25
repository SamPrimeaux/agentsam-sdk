/**
 * Recovery policy — separates "what failed" from "what to do".
 *
 * ErrorEnvelope → planRecovery → RecoveryPlan → SAM executes
 *
 * Critical rule: unknown side_effect_state ⇒ reconcile before retry.
 */

export const FAILURE_CLASS = Object.freeze({
  INPUT: 'input',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  POLICY: 'policy',
  DISCOVERY: 'discovery',
  RESOLUTION: 'resolution',
  TRANSPORT: 'transport',
  PROTOCOL: 'protocol',
  TIMEOUT: 'timeout',
  RATE_LIMIT: 'rate_limit',
  CAPACITY: 'capacity',
  RESOURCE: 'resource',
  FILESYSTEM: 'filesystem',
  PERSISTENCE: 'persistence',
  CONSISTENCY: 'consistency',
  CONFLICT: 'conflict',
  DEPENDENCY: 'dependency',
  PROCESS: 'process',
  IPC: 'ipc',
  DATA_INTEGRITY: 'data_integrity',
  CANCELLED: 'cancelled',
  UNKNOWN: 'unknown',
});

export const SIDE_EFFECT_STATE = Object.freeze({
  NONE: 'none',
  NOT_STARTED: 'not_started',
  CONFIRMED_NOT_APPLIED: 'confirmed_not_applied',
  CONFIRMED_APPLIED: 'confirmed_applied',
  PARTIALLY_APPLIED: 'partially_applied',
  UNKNOWN: 'unknown',
});

export const RECOVERY_SCHEMA = 'agentsam.recovery.v1';

const NO_RETRY_OWNERS = new Set(['policy']);
const CANCEL_REASONS = new Set([
  'cancelled_by_user',
  'cancelled_by_agent',
  'cancelled_by_policy',
  'cancelled_by_timeout',
  'cancelled_by_parent',
  'cancelled',
]);

/**
 * Infer failure_class from reason/code when not supplied.
 * @param {object} error
 */
export function inferFailureClass(error = {}) {
  const given = error.failure_class;
  if (given && Object.values(FAILURE_CLASS).includes(given)) return given;
  const reason = String(error.reason || '');
  const code = String(error.code || '');
  if (CANCEL_REASONS.has(reason) || code === 'CANCELLED') return FAILURE_CLASS.CANCELLED;
  if (/^auth_|unauthenticated|credential/.test(reason) || code === 'UNAUTHENTICATED') return FAILURE_CLASS.AUTHENTICATION;
  if (/permission|authorization|capability/.test(reason) || code === 'PERMISSION_DENIED') return FAILURE_CLASS.AUTHORIZATION;
  if (/policy/.test(reason)) return FAILURE_CLASS.POLICY;
  if (/rate_limit|resource_exhausted|quota|budget/.test(reason) || code === 'RESOURCE_EXHAUSTED') return FAILURE_CLASS.RATE_LIMIT;
  if (/timeout|deadline/.test(reason) || code === 'DEADLINE_EXCEEDED') return FAILURE_CLASS.TIMEOUT;
  if (/^fs_|filesystem|path_escape|version_conflict/.test(reason)) return FAILURE_CLASS.FILESYSTEM;
  if (/^db_|persistence|sqlite|d1/.test(reason)) return FAILURE_CLASS.PERSISTENCE;
  if (/conflict|etag|precondition|serialization/.test(reason) || code === 'ABORTED') return FAILURE_CLASS.CONFLICT;
  if (/^pty_|process_|ipc_/.test(reason)) return FAILURE_CLASS.PROCESS;
  if (/transport|connection|dns|tls|websocket|grpc_unavailable/.test(reason) || code === 'UNAVAILABLE') {
    return FAILURE_CLASS.TRANSPORT;
  }
  if (/corrupt|checksum|integrity|data_loss/.test(reason) || code === 'DATA_LOSS') return FAILURE_CLASS.DATA_INTEGRITY;
  if (/input_|invalid_argument|malformed/.test(reason) || code === 'INVALID_ARGUMENT') return FAILURE_CLASS.INPUT;
  return FAILURE_CLASS.UNKNOWN;
}

/**
 * Infer side_effect_state for the failed operation.
 * @param {object} error
 * @param {object} [operationContext]
 */
export function inferSideEffectState(error = {}, operationContext = {}) {
  const op = error.operation || operationContext.operation || {};
  if (op.side_effect_state) return op.side_effect_state;
  if (op.read_only === true || op.side_effect_state === SIDE_EFFECT_STATE.NONE) {
    return SIDE_EFFECT_STATE.NONE;
  }
  if (op.idempotent === true && error.retryable) {
    return SIDE_EFFECT_STATE.CONFIRMED_NOT_APPLIED;
  }
  // Timeouts / connection drops on mutating ops → outcome unknown
  const reason = String(error.reason || '');
  const code = String(error.code || '');
  if (
    code === 'DEADLINE_EXCEEDED'
    || /timeout|connection_reset|connection_closed|truncated/.test(reason)
  ) {
    if (op.read_only) return SIDE_EFFECT_STATE.NONE;
    return SIDE_EFFECT_STATE.UNKNOWN;
  }
  if (error.retryable === false && /permission|auth|input|policy/.test(reason)) {
    return SIDE_EFFECT_STATE.CONFIRMED_NOT_APPLIED;
  }
  return op.kind ? SIDE_EFFECT_STATE.UNKNOWN : SIDE_EFFECT_STATE.NONE;
}

/**
 * Central recovery planner — one policy for CLI / Worker / Studio / MCP.
 *
 * @param {object} error  ErrorEnvelope (v1+)
 * @param {object} [operationContext]
 * @returns {object} RecoveryPlan
 */
export function planRecovery(error = {}, operationContext = {}) {
  const failure_class = inferFailureClass(error);
  const side_effect_state = inferSideEffectState(error, operationContext);
  const attempt = Number(operationContext.attempt || error.retry?.attempt || 1);
  const maxAttempts = Number(
    operationContext.max_attempts
    ?? error.retry?.max_attempts
    ?? (error.retryable ? 4 : 1),
  );
  const evidence = [];
  evidence.push(`failure_class=${failure_class}`);
  evidence.push(`side_effect_state=${side_effect_state}`);
  evidence.push(`reason=${error.reason || 'unknown'}`);

  /** @type {object} */
  let plan = {
    schema: RECOVERY_SCHEMA,
    error_fingerprint: error.fingerprint || null,
    disposition: 'abort',
    attempts: { current: attempt, maximum: maxAttempts },
    delay_ms: null,
    fallback: null,
    notify: {
      user: 'immediately',
      operator: 'never',
      agent: 'stop',
    },
    reason: error.reason || 'unknown',
    evidence,
  };

  // Cancellations are not defects
  if (failure_class === FAILURE_CLASS.CANCELLED) {
    return freezePlan({
      ...plan,
      disposition: 'abort',
      notify: { user: 'never', operator: 'never', agent: 'stop' },
      reason: 'cancelled',
      evidence: [...evidence, 'cancellation_is_not_a_defect'],
    });
  }

  // Ambiguous side effects: NEVER blind retry
  if (
    side_effect_state === SIDE_EFFECT_STATE.UNKNOWN
    || side_effect_state === SIDE_EFFECT_STATE.PARTIALLY_APPLIED
  ) {
    return freezePlan({
      ...plan,
      disposition: 'reconcile',
      notify: { user: 'immediately', operator: 'warning', agent: 'wait' },
      reason: 'side_effect_uncertain',
      evidence: [...evidence, 'reconcile_before_retry'],
    });
  }

  // Policy / auth hard stops
  if (
    failure_class === FAILURE_CLASS.POLICY
    || failure_class === FAILURE_CLASS.AUTHORIZATION
    || NO_RETRY_OWNERS.has(error.resolution_owner)
  ) {
    return freezePlan({
      ...plan,
      disposition: 'await_user',
      notify: { user: 'immediately', operator: 'never', agent: 'wait' },
      reason: 'policy_or_auth_blocks_retry',
    });
  }

  if (failure_class === FAILURE_CLASS.AUTHENTICATION) {
    return freezePlan({
      ...plan,
      disposition: 'await_user',
      notify: { user: 'immediately', operator: 'never', agent: 'wait' },
      reason: 'authentication_required',
    });
  }

  if (failure_class === FAILURE_CLASS.INPUT || failure_class === FAILURE_CLASS.CONFLICT) {
    const disposition = failure_class === FAILURE_CLASS.CONFLICT && error.retryable
      ? 'retry'
      : 'await_user';
    return freezePlan({
      ...plan,
      disposition,
      delay_ms: disposition === 'retry' ? 0 : null,
      attempts: { current: attempt, maximum: Math.min(maxAttempts, 2) },
      notify: {
        user: disposition === 'await_user' ? 'immediately' : 'after_retry_exhausted',
        operator: 'never',
        agent: disposition === 'retry' ? 'retry' : 'wait',
      },
      reason: failure_class === FAILURE_CLASS.CONFLICT ? 'optimistic_concurrency' : 'invalid_input',
    });
  }

  // Safe retry path
  if (error.retryable && attempt < maxAttempts) {
    const delay = retryDelayFor(error, attempt, failure_class);
    return freezePlan({
      ...plan,
      disposition: failure_class === FAILURE_CLASS.TRANSPORT || /pty_|websocket|connection/.test(String(error.reason))
        ? 'reconnect'
        : 'retry',
      delay_ms: delay,
      notify: {
        user: attempt >= 2 ? 'on_degradation' : 'never',
        operator: 'never',
        agent: 'retry',
      },
      reason: 'retry_budget_remaining',
      evidence: [...evidence, `delay_ms=${delay}`],
    });
  }

  // Fallback if permitted and semantics-preserving
  const fallbackAllowed = error.fallback?.allowed === true
    || operationContext.fallback_allowed === true;
  const preserve = error.fallback?.preserve_semantics !== false
    && operationContext.preserve_semantics !== false;
  if (fallbackAllowed && preserve) {
    return freezePlan({
      ...plan,
      disposition: 'fallback',
      fallback: {
        kind: error.fallback?.strategy || operationContext.fallback_strategy || 'degraded_mode',
        target: error.fallback?.target || operationContext.fallback_target || null,
      },
      notify: { user: 'on_degradation', operator: 'warning', agent: 'continue' },
      reason: 'semantic_fallback_allowed',
    });
  }

  // Replan if GOAP/A* context available
  if (operationContext.replan_allowed) {
    return freezePlan({
      ...plan,
      disposition: 'replan',
      notify: { user: 'on_degradation', operator: 'never', agent: 'replan' },
      reason: 'retry_exhausted_replan',
    });
  }

  // Terminal block
  return freezePlan({
    ...plan,
    disposition: error.resolution_owner === 'user' ? 'await_user' : 'abort',
    notify: {
      user: 'immediately',
      operator: error.severity === 'blocking_internal' ? 'incident' : 'warning',
      agent: 'stop',
    },
    reason: 'recovery_exhausted',
  });
}

function retryDelayFor(error, attempt, failureClass) {
  if (Number.isFinite(error.retry_after_ms) && error.retry_after_ms >= 0) {
    return Math.round(error.retry_after_ms);
  }
  if (failureClass === FAILURE_CLASS.RATE_LIMIT) {
    return Math.min(60_000, Math.round(1000 * (2 ** Math.min(6, attempt - 1))));
  }
  if (failureClass === FAILURE_CLASS.TRANSPORT || failureClass === FAILURE_CLASS.TIMEOUT) {
    const base = 250;
    const capped = Math.min(8_000, base * (2 ** Math.min(5, attempt - 1)));
    const jitter = Math.floor(Math.random() * Math.max(50, capped * 0.2));
    return capped + jitter;
  }
  if (failureClass === FAILURE_CLASS.CONFLICT) return 0;
  return Math.min(4_000, 500 * (2 ** Math.min(4, attempt - 1)));
}

function freezePlan(plan) {
  return Object.freeze({
    ...plan,
    attempts: Object.freeze({ ...plan.attempts }),
    notify: Object.freeze({ ...plan.notify }),
    fallback: plan.fallback ? Object.freeze({ ...plan.fallback }) : null,
    evidence: Object.freeze([...(plan.evidence || [])]),
  });
}
