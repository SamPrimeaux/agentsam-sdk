import type { AgentArtifact } from './artifacts';
import type { AgentMessage, AgentRunStatus } from './agent';
import type { AgentToolCall } from './tools';

export type AgentEvent =
  | { type: 'message'; message: AgentMessage }
  | { type: 'message.delta'; messageId: string; delta: string }
  | { type: 'run.status'; runId: string; status: AgentRunStatus; error?: string }
  | { type: 'tool'; toolCall: AgentToolCall }
  | { type: 'artifact'; artifact: AgentArtifact }
  | { type: 'error'; runId?: string; error: string };
