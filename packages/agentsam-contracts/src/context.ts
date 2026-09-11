export type AgentSurface = 'chat' | 'work' | 'cad' | 'cms' | string;

export interface AgentContext {
  surface: AgentSurface;
  accountId?: string;
  authUserId?: string;
  repository?: string;
  files?: string[];
  selection?: unknown;
  projectId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentContextProvider {
  getContext(): AgentContext | Promise<AgentContext>;
}
