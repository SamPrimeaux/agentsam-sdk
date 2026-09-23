import type { AgentSamErrorEnvelope } from './errors';

export type AgentExecutionStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface AgentToolInvocation<TInput = unknown> {
  id: string;
  toolKey: string;
  input: TInput;
  requestedAt: number;
  accountId?: string;
  correlationId?: string;
  causationId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentToolExecutionResult<TOutput = unknown> {
  output?: TOutput;
  providerRequestId?: string;
  usage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AgentToolExecutionReceipt<TOutput = unknown> {
  invocationId: string;
  toolKey: string;
  status: AgentExecutionStatus;
  ok: boolean;
  attempt: number;
  queuedAt?: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  provider?: string;
  output?: TOutput;
  error?: AgentSamErrorEnvelope;
  emittedEventIds?: string[];
  providerRequestId?: string;
  usage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
