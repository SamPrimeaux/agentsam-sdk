export { WorkspaceSaveQueue } from './save-queue.js';
export type { SaveHost, SaveOutcome, SaveStatus } from './save-queue.js';
export { normalizeWorkspacePath, assertWorkspaceFile, FileWorkspaceError } from './files.js';
export type { FileWorkspace, WorkspaceEntry, WorkspaceFile, WorkspaceWriteResult, WorkspaceDiagnostic, WorkspaceSearchHit, WorkspaceRevision, WorkspaceSnapshot, WorkspaceChange, WorkspacePreview } from './files.js';
export { hashWorkspaceEntries, diffWorkspaceSnapshots } from './merkle.js';
export type { WorkspaceHashedEntry } from './merkle.js';

export { browserFsaAvailable, chooseBrowserFsaIDEWorkspace, restoreBrowserFsaIDEWorkspace, reconnectBrowserFsaIDEWorkspace, createBrowserFsaWorkspace } from './browser-fsa.js';
export type { BrowserFsaRestore } from './browser-fsa.js';

export { buildFsChangeMapFromStatus, fsChangeEntriesSorted, toWorkspaceChanges, buildVisibleChangePathSet, mapStatusTokenToState } from './changes.js';
export type { AgentGitStatusFilesPayload, FsChangeEntry, FsChangeState } from './changes.js';
