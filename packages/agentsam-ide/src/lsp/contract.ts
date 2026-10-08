/** Browser-safe LSP and transport contracts; no runtime imports. */
export type { LspMessage,LspTransport,LspDiagnostics,LspReady } from './client.js';
export type { LspTextEdit,LspWorkspaceEdit,LspWorkspaceWriter,LspWorkspaceFile } from './workspace-edits.js';
export type { LanguageCapability,LanguageCapabilities,LanguageStatus,LspHandshake } from './status.js';
