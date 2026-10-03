import { randomUUID } from 'node:crypto';

export const JOB_STATUSES = Object.freeze([
  'queued',
  'claimed',
  'running',
  'waiting',
  'batch_waiting',
  'awaiting_input',
  'retry_scheduled',
  'completed',
  'failed',
  'cancelled',
]);

export const TERMINAL_JOB_STATUSES = Object.freeze([
  'completed',
  'failed',
  'cancelled',
]);

export const JOB_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

export const EXECUTOR_KINDS = Object.freeze([
  'inline',
  'queue',
  'workflow',
  'execos',
  'worker_rpc',
  'openai_batch',
  'gemini_batch',
  'external',
]);

export const DEFAULT_RETRY_POLICY = Object.freeze({
  max_attempts: 3,
  backoff: 'exponential',
  initial_delay_ms: 1_000,
  max_delay_ms: 60_000,
  jitter: true,
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(', ')}`);
  }
}

function epochSeconds(value, fallback, field = 'timestamp') {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new TypeError(`${field} must be a non-negative epoch second`);
  return Math.floor(numeric);
}

export function computeRetryDelayMs(retry = DEFAULT_RETRY_POLICY, attempt = 1, random = Math.random) {
  const policy = { ...DEFAULT_RETRY_POLICY, ...(retry || {}) };
  const n = Math.max(1, Number.isInteger(attempt) ? attempt : 1);
  const initial = Math.max(0, Number(policy.initial_delay_ms) || 0);
  const maximum = Math.max(initial, Number(policy.max_delay_ms) || initial);
  let delay = policy.backoff === 'exponential'
    ? initial * (2 ** (n - 1))
    : initial;
  delay = Math.min(maximum, delay);
  if (policy.jitter && delay > 0) {
    const sample = Math.max(0, Math.min(1, Number(random()) || 0));
    delay = Math.floor((delay / 2) + ((delay / 2) * sample));
  }
  return Math.max(0, Math.floor(delay));
}

export function createRetrySchedule(job, { now_ms = Date.now(), random = Math.random, error = null } = {}) {
  assertJobEnvelope(job);
  const nextAttempt = (Number.isInteger(job.attempt) ? job.attempt : 0) + 1;
  const maxAttempts = Math.max(1, Number(job.retry?.max_attempts) || DEFAULT_RETRY_POLICY.max_attempts);
  if (nextAttempt >= maxAttempts) {
    return {
      retryable: false,
      exhausted: true,
      attempt: nextAttempt,
      delay_ms: 0,
      available_at: null,
      job: null,
    };
  }
  const delayMs = computeRetryDelayMs(job.retry, nextAttempt, random);
  const availableAt = Math.ceil((Number(now_ms) + delayMs) / 1000);
  return {
    retryable: true,
    exhausted: false,
    attempt: nextAttempt,
    delay_ms: delayMs,
    available_at: availableAt,
    job: {
      ...job,
      status: 'retry_scheduled',
      attempt: nextAttempt,
      available_at: availableAt,
      lease_owner: null,
      lease_expires_at: null,
      metadata: {
        ...(job.metadata || {}),
        ...(error ? { last_error: String(error?.message || error) } : {}),
      },
    },
  };
}

export function isJobAvailable(job, now = Math.floor(Date.now() / 1000)) {
  return (job?.available_at ?? 0) <= now;
}

export function jobExecutionIdentity(job) {
  assertJobEnvelope(job);
  return Object.freeze({
    job_id: job.id,
    run_id: job.source_run_id ?? null,
    step_id: job.step_id ?? null,
    attempt: job.attempt ?? 0,
    idempotency_key: clean(job.idempotency_key) || job.id,
    lease_owner: job.lease_owner ?? null,
    lease_expires_at: job.lease_expires_at ?? null,
    lease_generation: job.lease_generation ?? 0,
  });
}

export function canClaimJobLease(job, { now = Math.floor(Date.now() / 1000), owner = null } = {}) {
  assertJobEnvelope(job);
  if (isTerminalJobStatus(job.status)) return false;
  if (!isJobAvailable(job, now)) return false;
  const leaseOwner = clean(job.lease_owner);
  const leaseExpiresAt = job.lease_expires_at == null
    ? null
    : epochSeconds(job.lease_expires_at, null, 'lease_expires_at');
  if (!leaseOwner || leaseExpiresAt == null || leaseExpiresAt <= now) return true;
  return Boolean(owner && leaseOwner === clean(owner));
}

export function claimJobLease(job, { owner, now = Math.floor(Date.now() / 1000), ttl_seconds = 60 } = {}) {
  assertJobEnvelope(job);
  const leaseOwner = clean(owner);
  if (!leaseOwner) throw new TypeError('lease owner is required');
  const ttl = Math.max(1, Math.floor(Number(ttl_seconds) || 0));
  if (!canClaimJobLease(job, { now, owner: leaseOwner })) {
    const error = new Error(isJobAvailable(job, now) ? 'job_lease_held' : 'job_not_available');
    error.code = isJobAvailable(job, now) ? 'lease_held' : 'job_not_available';
    throw error;
  }
  return {
    ...job,
    status: 'claimed',
    lease_owner: leaseOwner,
    lease_expires_at: now + ttl,
    lease_generation: Math.max(0, Number(job.lease_generation) || 0) + 1,
  };
}

export function refreshJobLease(job, { owner, now = Math.floor(Date.now() / 1000), ttl_seconds = 60 } = {}) {
  assertJobEnvelope(job);
  const leaseOwner = clean(owner);
  if (!leaseOwner || leaseOwner !== clean(job.lease_owner)) {
    const error = new Error('job_lease_owner_mismatch');
    error.code = 'lease_owner_mismatch';
    throw error;
  }
  const currentExpiry = epochSeconds(job.lease_expires_at, 0, 'lease_expires_at');
  if (currentExpiry <= now) {
    const error = new Error('job_lease_expired');
    error.code = 'lease_expired';
    throw error;
  }
  const ttl = Math.max(1, Math.floor(Number(ttl_seconds) || 0));
  return { ...job, lease_expires_at: now + ttl };
}

export function releaseJobLease(job, { owner, status = 'queued', available_at = job.available_at } = {}) {
  assertJobEnvelope(job);
  const leaseOwner = clean(owner);
  if (leaseOwner && clean(job.lease_owner) && leaseOwner !== clean(job.lease_owner)) {
    const error = new Error('job_lease_owner_mismatch');
    error.code = 'lease_owner_mismatch';
    throw error;
  }
  assertEnum(status, JOB_STATUSES, 'status');
  return {
    ...job,
    status,
    available_at: epochSeconds(available_at, job.available_at, 'available_at'),
    lease_owner: null,
    lease_expires_at: null,
  };
}

export function createJobEnvelope(input = {}) {
  const kind = clean(input.kind);
  if (!kind) throw new TypeError('kind is required');

  const accountId = clean(input.account_id);
  if (!accountId) throw new TypeError('account_id is required');

  const now = input.created_at ?? Math.floor(Date.now() / 1000);
  const availableAt = epochSeconds(input.available_at ?? input.availableAt, now, 'available_at');
  const id = clean(input.id) || `job_${randomUUID().replaceAll('-', '')}`;
  const priority = input.priority ?? 'normal';
  assertEnum(priority, JOB_PRIORITIES, 'priority');

  const executor = input.executor ?? 'queue';
  assertEnum(executor, EXECUTOR_KINDS, 'executor');

  return {
    schema_version: '1',
    id,
    account_id: accountId,
    kind,
    logical_queue: clean(input.logical_queue) || null,
    executor,
    priority,
    status: input.status ?? 'queued',
    parent_job_id: clean(input.parent_job_id) || null,
    conversation_id: clean(input.conversation_id) || null,
    agent_id: clean(input.agent_id) || null,
    source_run_id: clean(input.source_run_id ?? input.run_id) || null,
    step_id: clean(input.step_id) || null,
    idempotency_key: clean(input.idempotency_key ?? input.idempotencyKey) || id,
    lease_owner: clean(input.lease_owner) || null,
    lease_expires_at: input.lease_expires_at == null ? null : epochSeconds(input.lease_expires_at, null, 'lease_expires_at'),
    lease_generation: Number.isInteger(input.lease_generation) ? Math.max(0, input.lease_generation) : 0,
    payload: input.payload ?? null,
    payload_ref: clean(input.payload_ref) || null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    retry: {
      ...DEFAULT_RETRY_POLICY,
      ...(input.retry && typeof input.retry === 'object' ? input.retry : {}),
    },
    attempt: Number.isInteger(input.attempt) ? input.attempt : 0,
    available_at: availableAt,
    created_at: now,
  };
}

export function assertJobEnvelope(job) {
  if (!job || typeof job !== 'object') throw new TypeError('job envelope must be an object');
  if (job.schema_version !== '1') throw new TypeError('unsupported job schema_version');
  if (!clean(job.id)) throw new TypeError('job.id is required');
  if (!clean(job.account_id)) throw new TypeError('job.account_id is required');
  if (!clean(job.kind)) throw new TypeError('job.kind is required');
  assertEnum(job.priority ?? 'normal', JOB_PRIORITIES, 'job.priority');
  assertEnum(job.executor ?? 'queue', EXECUTOR_KINDS, 'job.executor');
  assertEnum(job.status ?? 'queued', JOB_STATUSES, 'job.status');
  epochSeconds(job.available_at, job.created_at ?? 0, 'job.available_at');
  if (job.lease_expires_at != null) epochSeconds(job.lease_expires_at, null, 'job.lease_expires_at');
  if (job.lease_owner && job.lease_expires_at == null) throw new TypeError('job.lease_expires_at is required when job.lease_owner is set');
  return job;
}

export function createReceipt(job, input = {}) {
  assertJobEnvelope(job);
  const status = input.status ?? 'completed';
  assertEnum(status, JOB_STATUSES, 'receipt.status');

  return {
    schema_version: '1',
    receipt_id: clean(input.receipt_id) || `receipt_${randomUUID().replaceAll('-', '')}`,
    job_id: job.id,
    account_id: job.account_id,
    kind: job.kind,
    status,
    executor: input.executor ?? job.executor,
    provider: clean(input.provider) || null,
    provider_job_id: clean(input.provider_job_id) || null,
    result: input.result ?? null,
    result_ref: clean(input.result_ref) || null,
    error: input.error ?? null,
    attempt: Number.isInteger(input.attempt) ? input.attempt : job.attempt,
    started_at: input.started_at ?? null,
    completed_at: input.completed_at ?? Math.floor(Date.now() / 1000),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
}

export function isTerminalJobStatus(status) {
  return TERMINAL_JOB_STATUSES.includes(status);
}
