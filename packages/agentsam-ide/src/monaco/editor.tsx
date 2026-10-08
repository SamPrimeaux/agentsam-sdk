import { useEffect, useMemo, useRef } from 'react';
import Editor, { type BeforeMount, type OnMount, type Monaco, type EditorProps } from '@monaco-editor/react';
import { languageIdFromPath } from './model.js';
import { workspaceDocumentUri } from './workspace.js';
import type { Uri, editor as MonacoEditorNamespace } from 'monaco-editor';

export type AgentSamEditorDocument = {
  workspaceId: string;
  path: string;
  text: string;
  /** Optional host-selected language; otherwise derived from the file extension. */
  languageId?: string;
  /** Optional stable document version supplied by the workspace host. */
  version?: number;
};

export type AgentSamEditorPalette = {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light';
  background: string;
  foreground: string;
  panel: string;
  border: string;
  muted: string;
  accent: string;
  comment?: string;
  string?: string;
  keyword?: string;
};

export type AgentSamEditorSelection = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  selectedText: string;
};

export type AgentSamEditorDiagnostic = {
  message: string;
  severity: number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source?: string;
  code?: string | number;
};

export type AgentSamMonacoEditorProps = {
  document: AgentSamEditorDocument;
  /** Controlled text changes; the host owns persistence, not the editor. */
  onChange(text: string, document: AgentSamEditorDocument): void;
  onSave?(text: string, document: AgentSamEditorDocument): void | Promise<void>;
  onSelectionChange?(selection: AgentSamEditorSelection, document: AgentSamEditorDocument): void;
  onDiagnostics?(diagnostics: AgentSamEditorDiagnostic[], document: AgentSamEditorDocument): void;
  onEditorReady?: OnMount;
  palette?: AgentSamEditorPalette;
  themeId?: string;
  readOnly?: boolean;
  options?: EditorProps['options'];
  className?: string;
  height?: string | number;
  loading?: EditorProps['loading'];
};

const DEFAULT_OPTIONS: NonNullable<EditorProps['options']> = {
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: 'IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  padding: { top: 12, bottom: 12 },
  renderLineHighlight: 'line',
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  formatOnPaste: true,
  bracketPairColorization: { enabled: true },
  guides: { indentation: true },
  mouseWheelZoom: true,
  ariaLabel: 'Source code editor',
};

const stripHash = (value: string): string => value.replace(/^#/, '');

/** No global setTheme call here: the React host selects the resulting theme. */
export function defineAgentSamEditorTheme(monaco: Monaco, name: string, p: AgentSamEditorPalette): void {
  monaco.editor.defineTheme(name, {
    base: p.base,
    inherit: true,
    rules: [
      { token: 'comment', foreground: stripHash(p.comment ?? p.muted) },
      { token: 'string', foreground: stripHash(p.string ?? p.accent) },
      { token: 'keyword', foreground: stripHash(p.keyword ?? p.foreground) },
    ],
    colors: {
      'editor.background': p.background,
      'editor.foreground': p.foreground,
      'editorLineNumber.foreground': p.muted,
      'editorLineNumber.activeForeground': p.accent,
      'editor.lineHighlightBackground': p.panel,
      'editorCursor.foreground': p.accent,
      'editor.selectionBackground': `${p.accent}33`,
      'editorGutter.background': p.background,
      'editorWidget.background': p.panel,
      'editorWidget.border': p.border,
      'editorIndentGuide.background': p.border,
      'editorIndentGuide.activeBackground': p.muted,
    },
  });
}

/** Portable Monaco UI. All filesystem, auth, LSP and sidecar behavior is host-owned. */
export function AgentSamMonacoEditor({
  document, onChange, onSave, onSelectionChange, onDiagnostics, onEditorReady,
  palette, themeId = 'agentsam-ide', readOnly = false, options, className,
  height = '100%', loading = 'Loading editor…',
}: AgentSamMonacoEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const callbacks = useRef({ document, onSave, onSelectionChange, onDiagnostics, onEditorReady });
  callbacks.current = { document, onSave, onSelectionChange, onDiagnostics, onEditorReady };

  const uri = useMemo(() => workspaceDocumentUri(document), [document.workspaceId, document.path]);
  const language = document.languageId || languageIdFromPath(document.path);

  const beforeMount: BeforeMount = (monaco) => {
    if (palette) defineAgentSamEditorTheme(monaco, themeId, palette);
  };

  const mount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    if (palette) defineAgentSamEditorTheme(monaco, themeId, palette);
    editor.addAction({
      id: 'agentsam.ide.format',
      label: 'Format document',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: async (ed) => { await ed.getAction('editor.action.formatDocument')?.run(); },
    });
    editor.addAction({
      id: 'agentsam.ide.save',
      label: 'Save document',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: async (ed) => { await callbacks.current.onSave?.(ed.getValue(), callbacks.current.document); },
    });
    const selectionSubscription = editor.onDidChangeCursorSelection(({ selection }) => {
      const current = callbacks.current;
      if (!current.onSelectionChange) return;
      const model = editor.getModel();
      if (!model) return;
      current.onSelectionChange({
        startLine: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLine: selection.endLineNumber,
        endColumn: selection.endColumn,
        selectedText: model.getValueInRange(selection),
      }, current.document);
    });
    const publishMarkers = () => {
      const current = callbacks.current;
      const model = editor.getModel();
      if (!model || !current.onDiagnostics) return;
      current.onDiagnostics(monaco.editor.getModelMarkers({ resource: model.uri }).map((marker: MonacoEditorNamespace.IMarker) => ({
        message: marker.message,
        severity: marker.severity,
        startLineNumber: marker.startLineNumber,
        startColumn: marker.startColumn,
        endLineNumber: marker.endLineNumber,
        endColumn: marker.endColumn,
        ...(marker.source ? { source: marker.source } : {}),
        ...(marker.code !== undefined ? { code: typeof marker.code === 'object' ? marker.code.value : marker.code } : {}),
      })), current.document);
    };
    const modelSubscription = editor.onDidChangeModel(publishMarkers);
    const markerSubscription = monaco.editor.onDidChangeMarkers((changed: readonly Uri[]) => {
      const current = editor.getModel()?.uri.toString();
      if (current && changed.some((resource: Uri) => resource.toString() === current)) publishMarkers();
    });
    editor.onDidDispose(() => {
      selectionSubscription.dispose();
      modelSubscription.dispose();
      markerSubscription.dispose();
    });
    publishMarkers();
    callbacks.current.onEditorReady?.(editor, monaco);
    editor.focus();
  };

  useEffect(() => {
    if (!palette || !monacoRef.current) return;
    defineAgentSamEditorTheme(monacoRef.current, themeId, palette);
    monacoRef.current.editor.setTheme(themeId);
  }, [palette, themeId]);

  return (
    <Editor
      className={className}
      height={height}
      path={uri}
      language={language}
      value={document.text}
      theme={palette ? themeId : themeId === 'agentsam-ide' ? 'vs-dark' : themeId}
      loading={loading}
      beforeMount={beforeMount}
      onMount={mount}
      onChange={value => onChange(value ?? '', callbacks.current.document)}
      saveViewState
      keepCurrentModel
      options={{ ...DEFAULT_OPTIONS, ...options, ...(readOnly !== undefined ? { readOnly } : {}) }}
    />
  );
}
