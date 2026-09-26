/** Monaco host contract — Local Studio wires @monaco-editor/react to this API. */

export type IdeDocumentUri = string;

export type IdeDocument = {
  uri: IdeDocumentUri;
  path: string;
  languageId: string;
  version: number;
  text: string;
};

export type MonacoHostOptions = {
  themeId?: string;
  readOnly?: boolean;
  /** When true, attach LSP via agentsam-ide/lsp once agentsamd handshake succeeds. */
  enableLsp?: boolean;
};

export function languageIdFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return 'javascript';
  }
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.go')) return 'go';
  if (lower.endsWith('.rs')) return 'rust';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.md')) return 'markdown';
  return 'plaintext';
}

export function createDocument(path: string, text: string, version = 1): IdeDocument {
  return {
    uri: path.startsWith('file:') ? path : `file://${path}`,
    path,
    languageId: languageIdFromPath(path),
    version,
    text,
  };
}
