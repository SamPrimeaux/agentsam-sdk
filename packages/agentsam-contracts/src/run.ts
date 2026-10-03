import type { AgentRunStatus } from './agent';

export type AgentRunSuspensionReason =
  | 'external'
  | 'child_run'
  | 'approval'
  | 'input'
  | 'retry'
  | 'scheduled'
  | 'rate_limit';

export interface AgentRunSuspension {
  runId: string;
  state:
    | 'waiting_external'
    | 'waiting_child'
    | 'awaiting_input'
    | 'awaiting_approval'
    | 'sleeping'
    | 'retry_scheduled';
  reason: AgentRunSuspensionReason;
  wakeAt?: number;
  wakeEvent?: string;
  dependencyRunIds?: string[];
  attempt?: number;
  resumeStepId?: string;
  checkpointRef?: string;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export type AgentRunWakeKind = 'event' | 'dependency' | 'scheduled' | 'manual';

export interface AgentRunWakeSignal {
  id: string;
  runId: string;
  kind: AgentRunWakeKind;
  occurredAt: number;
  dedupeKey: string;
  eventKey?: string;
  dependencyRunId?: string;
  metadata?: Record<string, unknown>;
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

export type AgentRunWakeDecisionReason =
  | 'accepted'
  | 'duplicate'
  | 'run_mismatch'
  | 'expired'
  | 'condition_not_met';

export interface AgentRunWakeDecision {
  accepted: boolean;
  reason: AgentRunWakeDecisionReason;
  nextStatus?: 'queued';
}

export function evaluateAgentRunWake(
  suspension: AgentRunSuspension,
  wake: AgentRunWakeSignal,
  options: { consumedDedupeKeys?: Iterable<string>; now?: number } = {},
): AgentRunWakeDecision {
  const consumed = new Set(options.consumedDedupeKeys || []);
  if (consumed.has(wake.dedupeKey)) return { accepted: false, reason: 'duplicate' };
  if (suspension.runId !== wake.runId) return { accepted: false, reason: 'run_mismatch' };

  const now = options.now ?? wake.occurredAt;
  if (suspension.expiresAt != null && now > suspension.expiresAt) {
    return { accepted: false, reason: 'expired' };
  }

  const matched = wake.kind === 'manual'
    || Boolean(suspension.wakeEvent && wake.eventKey === suspension.wakeEvent)
    || Boolean(
      wake.kind === 'dependency'
      && wake.dependencyRunId
      && (suspension.dependencyRunIds || []).includes(wake.dependencyRunId),
    )
    || Boolean(wake.kind === 'scheduled' && suspension.wakeAt != null && now >= suspension.wakeAt);

  return matched
    ? { accepted: true, reason: 'accepted', nextStatus: 'queued' }
    : { accepted: false, reason: 'condition_not_met' };
}

export function wakeMatchesSuspension(
  suspension: AgentRunSuspension,
  wake: AgentRunWakeSignal,
  now = wake.occurredAt,
): boolean {
  return evaluateAgentRunWake(suspension, wake, { now }).accepted;
}

export type AgentRunLifecycleAction =
  | { type: 'start' }
  | { type: 'suspend'; status: AgentRunSuspension['state'] }
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
  if (action.type === 'suspend') return action.status;
  if (action.type === 'wake') return 'queued';
  if (action.type === 'start') return 'running';
  return status;
}

export type AgentRunEventType =
  | 'run.created'
  | 'run.queued'
  | 'run.started'
  | 'run.status'
  | 'run.suspended'
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
  if (event.eventType === 'run.suspended') return 'waiting';
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
  if (event.eventType === 'run.cancelled' || event.eventType === 'run.suspended' || event.eventType === 'run.woken' || event.eventType === 'run.status' || event.eventType === 'run.cancel_requested' || event.eventType === 'run.created' || event.eventType === 'run.queued') return 'phase.changed';
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
