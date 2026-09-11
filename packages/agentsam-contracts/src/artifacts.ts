export type AgentArtifactKind =
  | 'code'
  | 'file'
  | 'preview'
  | 'browser'
  | 'terminal'
  | 'deploy'
  | 'render'
  | 'model'
  | 'receipt'
  | string;

export interface AgentAttachment {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  text?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentArtifact {
  id: string;
  kind: AgentArtifactKind;
  title?: string;
  mimeType?: string;
  content?: string;
  url?: string;
  createdAt?: number;
  updatedAt?: number;
  metadata?: Record<string, unknown>;
}
