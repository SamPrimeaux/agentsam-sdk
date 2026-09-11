import type { AgentEvent } from './events';
import type { AgentInput, AgentRun } from './agent';
import type { AgentCapability } from './tools';
import type { ModelOption } from './models';

export interface AgentWorkbenchAdapter {
  send(input: AgentInput): AgentRun | Promise<AgentRun>;
  cancel(runId: string): void | Promise<void>;
  getModels(): ModelOption[] | Promise<ModelOption[]>;
  getCapabilities(): AgentCapability[] | Promise<AgentCapability[]>;
  subscribe(conversationId: string, onEvent: (event: AgentEvent) => void): () => void;
}

export interface BrowserWorkbenchAdapter {
  navigate(url: string): void | Promise<void>;
  back?(): void | Promise<void>;
  forward?(): void | Promise<void>;
  reload?(): void | Promise<void>;
}

export interface TerminalWorkbenchAdapter {
  write(command: string): void | Promise<void>;
  interrupt?(): void | Promise<void>;
  resize?(cols: number, rows: number): void | Promise<void>;
}
