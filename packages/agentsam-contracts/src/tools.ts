export interface AgentCapability {
  id: string;
  label?: string;
  description?: string;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

export type AgentToolCallStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AgentToolCall {
  id: string;
  runId?: string;
  name: string;
  status: AgentToolCallStatus;
  startedAt?: number;
  completedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}
