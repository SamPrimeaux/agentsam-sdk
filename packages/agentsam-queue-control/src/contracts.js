import { randomUUID } from 'node:crypto';

export const JOB_STATUSES = Object.freeze([
  'queued',
  'claimed',
  'running',
  'waiting',
  'batch_waiting',
  'awaiting_input',
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
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new TypeError(`${field} must be one of: ${allowed.join(', ')}`);
  }
}

export function createJobEnvelope(input = {}) {
  const kind = clean(input.kind);
  if (!kind) throw new TypeError('kind is required');

  const accountId = clean(input.account_id);
  if (!accountId) throw new TypeError('account_id is required');

  const now = input.created_at ?? Math.floor(Date.now() / 1000);
  const priority = input.priority ?? 'normal';
  assertEnum(priority, JOB_PRIORITIES, 'priority');

  const executor = input.executor ?? 'queue';
  assertEnum(executor, EXECUTOR_KINDS, 'executor');

  return {
    schema_version: '1',
    id: clean(input.id) || `job_${randomUUID().replaceAll('-', '')}`,
    account_id: accountId,
    kind,
    logical_queue: clean(input.logical_queue) || null,
    executor,
    priority,
    status: input.status ?? 'queued',
    parent_job_id: clean(input.parent_job_id) || null,
    conversation_id: clean(input.conversation_id) || null,
    agent_id: clean(input.agent_id) || null,
    source_run_id: clean(input.source_run_id) || null,
    idempotency_key: clean(input.idempotency_key) || null,
    payload: input.payload ?? null,
    payload_ref: clean(input.payload_ref) || null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    retry: {
      ...DEFAULT_RETRY_POLICY,
      ...(input.retry && typeof input.retry === 'object' ? input.retry : {}),
    },
    attempt: Number.isInteger(input.attempt) ? input.attempt : 0,
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
