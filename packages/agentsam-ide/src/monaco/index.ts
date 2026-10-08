/** Editor presentation lives here; filesystem and language servers belong to host adapters. */
export * from './model.js';
export { workspaceDocumentUri, disposeWorkspaceModels } from './workspace.js';
export type { WorkspaceDocumentIdentity } from './workspace.js';
export { AgentSamMonacoEditor, defineAgentSamEditorTheme } from './editor.js';
export type { AgentSamEditorDocument, AgentSamEditorPalette, AgentSamEditorSelection, AgentSamEditorDiagnostic, AgentSamMonacoEditorProps } from './editor.js';
