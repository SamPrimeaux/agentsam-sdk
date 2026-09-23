export type AgentHookActionType = 'tool' | 'workflow' | 'event';

export interface AgentHookAction {
  actionId?: string;
  type: AgentHookActionType;
  target: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentHookDefinition {
  hookKey: string;
  displayName?: string;
  description?: string;
  eventKeys: string[];
  enabled: boolean;
  filter?: Record<string, unknown>;
  actions: AgentHookAction[];
  metadata?: Record<string, unknown>;
}

export type AgentHookExecutionStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentHookExecutionReceipt {
  executionId: string;
  hookKey: string;
  eventId: string;
  status: AgentHookExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
  actionExecutionIds?: string[];
  error?: unknown;
  metadata?: Record<string, unknown>;
}
