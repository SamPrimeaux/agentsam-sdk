/** Host-owned files for a reusable editor. This module cannot import a CMS or storage client. */
export type WorkspaceEntry = {
  path: string;
  kind: 'file' | 'folder';
  size?: number;
  language?: string;
  readonly?: boolean;
};

export type WorkspaceFile = {
  path: string;
  content: string;
  /** Immutable host-issued version/hash for optimistic writes. */
  version: string;
  language?: string;
  readonly?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
  encoding?: string;
  eol?: 'LF' | 'CRLF';
};

export type WorkspaceDiagnostic = {
  path: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  line?: number;
  column?: number;
  /** Only an error explicitly marked blocking may stop a save. */
  blocksSave?: boolean;
};

export type WorkspaceSearchHit = {
  path: string;
  line: number;
  column: number;
  preview: string;
};

export type WorkspaceRevision = {
  id: string;
  path: string;
  version: string;
  createdAt: string;
  label?: string;
};

export type WorkspaceWriteResult =
  | { ok: true; file: WorkspaceFile }
  | { ok: false; code: 'version_conflict' | 'validation' | 'offline' | 'permission' | 'unavailable' | string; message: string; current?: WorkspaceFile; diagnostics?: WorkspaceDiagnostic[] };

export type WorkspaceChange = {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflict';
  previousPath?: string;
};

export type WorkspaceSnapshot = {
  id: string;
  rootHash: string;
  fileCount: number;
  createdAt: string;
  entries?: Array<{path: string; hash: string}>;
};

export interface FileWorkspace {
  /** The host authenticates, authorizes and scopes every operation. */
  list(directory?: string): Promise<WorkspaceEntry[]>;
  read(path: string): Promise<WorkspaceFile>;
  write(path: string, content: string, expectedVersion: string | null, options?: { overwrite?: boolean }): Promise<WorkspaceWriteResult>;
  create(path: string, kind: WorkspaceEntry['kind']): Promise<WorkspaceEntry>;
  rename(path: string, destination: string): Promise<WorkspaceEntry>;
  delete(path: string, expectedVersion?: string): Promise<void>;
  search(query: string): Promise<WorkspaceSearchHit[]>;
  history(path: string): Promise<WorkspaceRevision[]>;
  restore(path: string, revisionId: string, expectedVersion: string): Promise<WorkspaceWriteResult>;
  validate?(path: string, content: string): Promise<WorkspaceDiagnostic[]>;
  /** Optional, host-authorized Git/diff implementation. Never synthesize change status. */
  changes?(): Promise<WorkspaceChange[]>;
  /** Optional, host-authorized Merkle manifest. Never claim a snapshot without a root hash. */
  snapshot?(): Promise<WorkspaceSnapshot>;
  /** Renderability and external language policy are host decisions. */
  configuration?: { defaultLanguage?: string; supportedLanguages?: string[]; directories?: string[]; references?: string[]; dependencies?: string[] };
}

export class FileWorkspaceError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FileWorkspaceError';
    this.code = code;
  }
}

export function normalizeWorkspacePath(value: string, kind: WorkspaceEntry['kind'] = 'file'): string {
  if (typeof value !== 'string' || value.includes('\\') || value.includes('\\0')) throw new FileWorkspaceError('invalid_path', 'Use a workspace-relative path.');
  const path = value.trim().replace(/^\/+|\/+$/g, '');
  if (!path || path.length > 500 || path.split('/').some(part =>
    !part || part === '.' || part === '..' || /[\u0000-\u001f<>:"|?*]/.test(part)))
    throw new FileWorkspaceError('invalid_path', 'Invalid file or folder path.');
  if (kind === 'file' && value.endsWith('/')) throw new FileWorkspaceError('invalid_path', 'Choose a filename, not a directory.');
  return path;
}

export function assertWorkspaceFile(value: WorkspaceFile): WorkspaceFile {
  normalizeWorkspacePath(value.path);
  if (typeof value.version !== 'string' || !value.version.trim()) throw new FileWorkspaceError('missing_version', 'The host must return a verified version for every file.');
  if (typeof value.content !== 'string') throw new FileWorkspaceError('invalid_content', 'The host must return text content.');
  return value;
}
