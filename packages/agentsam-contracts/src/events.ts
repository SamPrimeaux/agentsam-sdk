import type { AgentArtifact } from './artifacts';
import type { AgentMessage, AgentRunStatus } from './agent';
import type { AgentToolCall } from './tools';

/**
 * Workbench-facing event stream retained for UI/runtime compatibility.
 */
export type AgentEvent =
  | { type: 'message'; message: AgentMessage }
  | { type: 'message.delta'; messageId: string; delta: string }
  | { type: 'run.status'; runId: string; status: AgentRunStatus; error?: string }
  | { type: 'tool'; toolCall: AgentToolCall }
  | { type: 'artifact'; artifact: AgentArtifact }
  | { type: 'error'; runId?: string; error: string };

export type AgentEventSourceKind =
  | 'webhook'
  | 'tool'
  | 'workflow'
  | 'provider'
  | 'system'
  | 'user';

export interface AgentEventSource {
  kind: AgentEventSourceKind;
  provider?: string;
  ref?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Portable orchestration/domain event. Provider events can be retained while a host
 * additionally emits normalized domain events (for example completeful.order.created
 * followed by commerce.order.created).
 */
export interface AgentOrchestrationEvent<TPayload = unknown> {
  id: string;
  eventKey: string;
  occurredAt: number;
  source: AgentEventSource;
  payload: TPayload;
  accountId?: string;
  subject?: string;
  correlationId?: string;
  causationId?: string;
  metadata?: Record<string, unknown>;
}
