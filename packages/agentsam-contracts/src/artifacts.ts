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
  /** @deprecated prefer kind — kept for backward compatibility */
  name: string;
  mimeType?: string;
  size?: number;
  /** @deprecated text-file shortcut — do not use for images */
  text?: string;
  url?: string;
  metadata?: Record<string, unknown>;

  /** Structured multimodal fields (v1+) */
  kind?:
    | 'image'
    | 'document'
    | 'text'
    | 'archive'
    | 'audio'
    | 'video'
    | 'model'
    | 'binary';
  source?:
    | { type: 'local_path'; path: string }
    | { type: 'blob'; blobId: string }
    | { type: 'url'; url: string }
    | { type: 'r2'; bucket: string; key: string }
    | { type: 'artifact'; artifactId: string };
  sha256?: string;
  image?: {
    width: number;
    height: number;
    alpha?: boolean;
    orientation?: number;
  };
  preview?: {
    url?: string;
    localPath?: string;
  };
  inference?: {
    mimeType: string;
    source:
      | { type: 'local_path'; path: string }
      | { type: 'blob'; blobId: string }
      | { type: 'url'; url: string };
    width?: number;
    height?: number;
    bytes?: number;
  };
  lifetime?: 'ephemeral' | 'conversation' | 'project' | 'artifact' | 'brand';
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
