import type { AgentRun, AgentRunStatus } from './agent';

/** Exact persisted status vocabulary accepted by the canonical D1 agentsam_agent_run table. */
export const AGENT_RUN_STORAGE_STATUSES = [
  'queued', 'running', 'completed', 'failed', 'partial', 'cancelled',
] as const;
export type AgentRunStorageStatus = typeof AGENT_RUN_STORAGE_STATUSES[number];

/**
 * Public ACP projection. status is the lifecycle view; storageStatus is the
 * narrower status persisted by the runtime. A timeout is recorded as a
 * run.timed_out event while storage remains failed.
 */
export interface AgentRunV1 extends AgentRun {
  schema: 'agentsam.run.v1';
  status: AgentRunStatus;
  storageStatus: AgentRunStorageStatus;
  cancelRequested: boolean;
  modelCallCount: number;
  toolCallCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
}

/** Control-plane acknowledgement; scheduling is not model execution. */
export interface AgentRunStartV1 {
  schema: 'agentsam.run-start.v1';
  run_id: string;
  status: 'queued';
  queue: string | null;
  queue_job: Record<string, unknown>;
  published: boolean;
}

export const AGENT_SPAWN_JOB_STATUSES = [
  'pending', 'awaiting_approval', 'running', 'merging', 'completed', 'failed', 'partial',
] as const;
export type AgentSpawnJobStatus = typeof AGENT_SPAWN_JOB_STATUSES[number];

/** A durable spawn orchestration backed by agentsam_spawn_job and parent_run_id. */
export interface AgentRunSpawnV1 {
  schema: 'agentsam.child-run-spawn.v1';
  parent_run_id: string;
  spawn_job_id: string;
  status: AgentSpawnJobStatus;
  child_run_id?: string;
  child_run_ids: string[];
  approval_id?: string;
  queue?: string | null;
  queue_job?: Record<string, unknown> | null;
  queue_jobs?: Array<Record<string, unknown>>;
  published: boolean;
}

export const AGENT_APPROVAL_STATUSES = ['pending', 'approved', 'denied', 'expired'] as const;
export type AgentApprovalStatus = typeof AGENT_APPROVAL_STATUSES[number];

export const AGENT_APPROVAL_TYPES = [
  'tool', 'workflow', 'command', 'script', 'deploy', 'db_write', 'r2_write',
  'github_write', 'terminal', 'hook', 'spawn', 'escalation', 'route_upgrade',
] as const;
export type AgentApprovalType = typeof AGENT_APPROVAL_TYPES[number];

export const AGENT_APPROVAL_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type AgentApprovalRiskLevel = typeof AGENT_APPROVAL_RISK_LEVELS[number];

/** Durable approval row projected from agentsam_approval_queue. */
export interface AgentApprovalV1 {
  id: string;
  accountId: string;
  sessionId?: string;
  conversationId?: string;
  runId?: string;
  toolCallId?: string;
  terminalJobId?: string;
  executionStepId?: string;
  capabilityKey?: string;
  workflowKey?: string;
  toolName?: string;
  toolId?: string;
  toolKey?: string;
  handlerKey?: string;
  routeKey?: string;
  actionSummary: string;
  sanitizedInput: Record<string, unknown>;
  response: Record<string, unknown>;
  metadata: Record<string, unknown>;
  riskLevel: AgentApprovalRiskLevel;
  approvalType: AgentApprovalType;
  status: AgentApprovalStatus;
  approvedBy?: string;
  decidedAt?: number;
  expiresAt?: number;
  notifiedAt?: number;
  haltedAt?: number;
  createdAt?: number;
}

export interface AgentRunResumeV1 {
  woke: boolean;
  reason?: string;
  resume_job?: Record<string, unknown>;
  queue?: string | null;
}

export interface AgentApprovalDecisionV1 {
  approval: AgentApprovalV1;
  spawn: AgentRunSpawnV1 | null;
  resume?: AgentRunResumeV1 | null;
  idempotent?: boolean;
}

export type AgentRunRetryClass = 'transient' | 'wait' | 'replan' | 'terminal';

export interface AgentRunRetryClassificationInput {
  code?: string | null;
  statusCode?: number | null;
  retryable?: boolean | null;
}

export interface AgentRunRetryClassification {
  class: AgentRunRetryClass;
  automaticRetry: boolean;
  reason: string;
}

const WAIT_CODES = new Set([
  'approval_required',
  'input_required',
  'external_pending',
  'dependency_pending',
]);

const REPLAN_CODES = new Set([
  'precondition_failed',
  'repository_changed',
  'capability_unavailable',
]);

const TRANSIENT_CODES = new Set([
  'timeout',
  'request_timeout',
  'rate_limited',
  'provider_unavailable',
  'runtime_unavailable',
  'econnreset',
  'econnrefused',
  'etimedout',
  'eai_again',
]);

export function classifyAgentRunRetry(input: AgentRunRetryClassificationInput = {}): AgentRunRetryClassification {
  const code = String(input.code || '').trim().toLowerCase();
  const statusCode = Number(input.statusCode);

  if (input.retryable === true) {
    return { class: 'transient', automaticRetry: true, reason: code || 'explicit_retryable' };
  }
  if (input.retryable === false) {
    return { class: 'terminal', automaticRetry: false, reason: code || 'explicit_non_retryable' };
  }
  if (WAIT_CODES.has(code)) {
    return { class: 'wait', automaticRetry: false, reason: code };
  }
  if (REPLAN_CODES.has(code)) {
    return { class: 'replan', automaticRetry: false, reason: code };
  }
  if (TRANSIENT_CODES.has(code) || [408, 425, 429, 500, 502, 503, 504].includes(statusCode)) {
    return { class: 'transient', automaticRetry: true, reason: code || `http_${statusCode}` };
  }
  return { class: 'terminal', automaticRetry: false, reason: code || 'unclassified_failure' };
}

export type AgentRunLifecycleAction =
  | { type: 'start' }
  | { type: 'wake' }
  | { type: 'complete' }
  | { type: 'fail' }
  | { type: 'cancel' }
  | { type: 'timeout' };

export function transitionAgentRunStatus(status: AgentRunStatus, action: AgentRunLifecycleAction): AgentRunStatus {
  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timed_out') {
    return status;
  }
  if (action.type === 'cancel') return 'cancelled';
  if (action.type === 'timeout') return 'timed_out';
  if (action.type === 'complete') return 'completed';
  if (action.type === 'fail') return 'failed';
  if (action.type === 'wake') return 'queued';
  if (action.type === 'start') return 'running';
  return status;
}

export type AgentRunEventType =
  | 'run.created'
  | 'run.queued'
  | 'run.started'
  | 'run.status'
  | 'run.woken'
  | 'run.cancel_requested'
  | 'run.cancelled'
  | 'run.timed_out'
  | 'run.failed'
  | 'run.completed'
  | 'step.started'
  | 'step.progress'
  | 'step.completed'
  | 'decision.made'
  | 'tool.started'
  | 'tool.completed'
  | 'artifact.created'
  | 'file.changed'
  | 'approval.required'
  | 'input.required'
  | 'verification.completed'
  | (string & {});

export type AgentActivityPhase =
  | 'boot'
  | 'observe'
  | 'context'
  | 'plan'
  | 'execute'
  | 'verify'
  | 'compact'
  | 'waiting'
  | 'recover'
  | 'complete';

export type AgentActivityEventType =
  | 'run.started'
  | 'phase.changed'
  | 'step.started'
  | 'step.progress'
  | 'step.completed'
  | 'decision.made'
  | 'tool.started'
  | 'tool.completed'
  | 'artifact.created'
  | 'file.changed'
  | 'approval.required'
  | 'input.required'
  | 'verification.completed'
  | 'run.failed'
  | 'run.completed';

export interface AgentRunEvent {
  id: string;
  runId: string;
  parentRunId?: string;
  seq: number;
  eventType: AgentRunEventType;
  status?: AgentRunStatus;
  phase?: AgentActivityPhase;
  stepId?: string;
  label?: string;
  detail?: string | null;
  progress?: { current: number; total: number } | null;
  source?: { kind?: string; name?: string | null } | null;
  evidence?: Record<string, unknown> | null;
  createdAt: number;
}

export interface AgentRunEventReceiptV1 {
  id: string;
  runId: string;
  parentRunId?: string;
  seq: number;
  eventType: string;
  status?: AgentRunStatus;
  phase?: AgentActivityPhase;
  stepId?: string;
  label: string;
  detail: string | null;
  progress: { current: number; total: number } | null;
  source: { kind?: string; name?: string | null } | null;
  evidence: Record<string, unknown> | null;
  createdAt: number;
}

export interface AgentRunReceiptV1 {
  schema: 'agentsam.run-receipt.v1';
  runId: string;
  status: AgentRunStatus;
  terminal: boolean;
  parentRunId: string | null;
  usage: {
    modelCalls: number;
    toolCalls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    costUsd: number;
  };
  timing: {
    createdAt: number | null;
    startedAt: number | null;
    completedAt: number | null;
    latencyMs: number | null;
  };
  error: { code: string | null; message: string | null } | null;
  eventCount: number;
  childRunCount: number;
  lastEvent: AgentRunEventReceiptV1 | null;
}

export interface AgentActivityEventV1 {
  schema: 'agentsam.activity.v1';
  run_id: string;
  seq: number;
  timestamp: string;
  phase: AgentActivityPhase;
  event: AgentActivityEventType;
  step_id: string | null;
  parent_id: string | null;
  label: string;
  detail: string | null;
  progress: { current: number; total: number } | null;
  source: { kind: string; name: string | null };
  evidence: Record<string, unknown> | null;
}

function phaseForRunEvent(event: AgentRunEvent): AgentActivityPhase {
  if (event.phase) return event.phase;
  if (event.eventType === 'run.created' || event.eventType === 'run.queued' || event.eventType === 'run.started') return 'boot';
  if (event.eventType === 'run.woken' || event.eventType === 'run.cancel_requested') return 'recover';
  if (event.eventType === 'verification.completed') return 'verify';
  if (event.eventType === 'run.completed' || event.eventType === 'run.cancelled' || event.eventType === 'run.timed_out') return 'complete';
  if (event.eventType === 'run.failed') return 'complete';
  return 'execute';
}

function activityTypeForRunEvent(event: AgentRunEvent): AgentActivityEventType {
  if (event.eventType === 'run.started') return 'run.started';
  if (event.eventType === 'run.completed') return 'run.completed';
  if (event.eventType === 'run.failed' || event.eventType === 'run.timed_out') return 'run.failed';
  if (event.eventType === 'run.cancelled' || event.eventType === 'run.woken' || event.eventType === 'run.status' || event.eventType === 'run.cancel_requested' || event.eventType === 'run.created' || event.eventType === 'run.queued') return 'phase.changed';
  if (event.eventType === 'step.started') return 'step.started';
  if (event.eventType === 'step.completed') return 'step.completed';
  if (event.eventType === 'decision.made') return 'decision.made';
  if (event.eventType === 'tool.started') return 'tool.started';
  if (event.eventType === 'tool.completed') return 'tool.completed';
  if (event.eventType === 'artifact.created') return 'artifact.created';
  if (event.eventType === 'file.changed') return 'file.changed';
  if (event.eventType === 'approval.required') return 'approval.required';
  if (event.eventType === 'input.required') return 'input.required';
  if (event.eventType === 'verification.completed') return 'verification.completed';
  return 'step.progress';
}

export function projectRunEventToActivity(event: AgentRunEvent): AgentActivityEventV1 {
  const evidence = {
    ...(event.evidence || {}),
    run_event_id: event.id,
    run_event_type: event.eventType,
    ...(event.status ? { run_status: event.status } : {}),
  };

  return {
    schema: 'agentsam.activity.v1',
    run_id: event.runId,
    seq: event.seq,
    timestamp: new Date(event.createdAt).toISOString(),
    phase: phaseForRunEvent(event),
    event: activityTypeForRunEvent(event),
    step_id: event.stepId ?? null,
    parent_id: event.parentRunId ?? null,
    label: event.label || '',
    detail: event.detail ?? null,
    progress: event.progress ?? null,
    source: {
      kind: event.source?.kind || 'sam',
      name: event.source?.name ?? null,
    },
    evidence,
  };
}
