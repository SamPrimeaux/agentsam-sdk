export { WorkspaceSaveQueue } from './save-queue.js';
export type { SaveHost, SaveOutcome, SaveStatus } from './save-queue.js';
export { normalizeWorkspacePath, assertWorkspaceFile, FileWorkspaceError } from './files.js';
export type { FileWorkspace, WorkspaceEntry, WorkspaceFile, WorkspaceWriteResult, WorkspaceDiagnostic, WorkspaceSearchHit, WorkspaceRevision, WorkspaceSnapshot, WorkspaceChange } from './files.js';
export { hashWorkspaceEntries, diffWorkspaceSnapshots } from './merkle.js';
export type { WorkspaceHashedEntry } from './merkle.js';

export { browserFsaAvailable, chooseBrowserFsaIDEWorkspace, createBrowserFsaWorkspace } from './browser-fsa.js';
