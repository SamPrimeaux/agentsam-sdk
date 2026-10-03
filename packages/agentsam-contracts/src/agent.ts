import type { AgentAttachment } from './artifacts';
import type { AgentContext } from './context';

export type AgentRole = 'user' | 'assistant' | 'system' | 'tool';

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: number;
  name?: string;
  modelId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentInput {
  conversationId: string;
  text: string;
  attachments?: AgentAttachment[];
  context?: AgentContext;
  modelId?: string;
  capabilityIds?: string[];
}

export type AgentRunMode = 'ask' | 'plan' | 'agent' | 'debug' | 'multitask';

export type AgentRunSelectedBy = 'manual' | 'automatic' | 'fallback';

export type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'waiting_external'
  | 'waiting_child'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'sleeping'
  | 'retry_scheduled'
  | 'partial'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'timed_out';

export type AgentRunTerminalStatus = 'completed' | 'cancelled' | 'failed' | 'timed_out';

export type AgentRunWaitingStatus =
  | 'waiting_external'
  | 'waiting_child'
  | 'awaiting_input'
  | 'awaiting_approval'
  | 'sleeping'
  | 'retry_scheduled';

export interface AgentRun {
  id: string;
  conversationId?: string;
  status: AgentRunStatus;
  startedAt?: number;
  completedAt?: number;

  accountId?: string;
  kind?: string;
  externalAgentId?: string;
  externalRunId?: string;
  parentRunId?: string;
  sourceClient?: string;
  surface?: string;
  mode?: AgentRunMode;
  modelId?: string;
  modelKey?: string;
  reasoningEffort?: string;
  requestedServiceTier?: string;
  actualServiceTier?: string;
  selectedBy?: AgentRunSelectedBy;
  cancelRequested?: boolean;
  errorCode?: string;
  errorMessage?: string;
  error?: string;
  modelCallCount?: number;
  toolCallCount?: number;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  createdAt?: number;
  updatedAt?: number;
  latencyMs?: number;
  planId?: string;
  todoId?: string;
  metadata?: Record<string, unknown>;
}

export function isAgentRunTerminalStatus(status: AgentRunStatus): status is AgentRunTerminalStatus {
  return status === 'completed' || status === 'cancelled' || status === 'failed' || status === 'timed_out';
}

export function isAgentRunWaitingStatus(status: AgentRunStatus): status is AgentRunWaitingStatus {
  return status === 'waiting_external'
    || status === 'waiting_child'
    || status === 'awaiting_input'
    || status === 'awaiting_approval'
    || status === 'sleeping'
    || status === 'retry_scheduled';
}

export function isAgentRunModelActiveStatus(status: AgentRunStatus): boolean {
  return status === 'queued' || status === 'running';
}
