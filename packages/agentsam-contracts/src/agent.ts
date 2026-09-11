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

export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface AgentRun {
  id: string;
  conversationId: string;
  status: AgentRunStatus;
  startedAt: number;
  completedAt?: number;
  modelId?: string;
  error?: string;
}
