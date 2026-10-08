import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type BeforeMount, type OnMount, type Monaco, type EditorProps } from '@monaco-editor/react';
import { languageIdFromPath } from './model.js';
import { workspaceDocumentUri } from './workspace.js';
import { LspClient, type LspTransport } from '../lsp/client.js';
import { attachLspToMonaco } from '../lsp/monaco.js';
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
  /** Verified persisted version supplied by the host; triggers LSP didSave, not merely a keypress. */
  savedVersion?: string;
  onSelectionChange?(selection: AgentSamEditorSelection, document: AgentSamEditorDocument): void;
  onDiagnostics?(diagnostics: AgentSamEditorDiagnostic[], document: AgentSamEditorDocument): void;
  /** Open a language-server target using the host's authorized workspace UI. */
  onNavigate?: (uri:string,range:{start:{line:number;character:number};end:{line:number;character:number}})=>Promise<void>|void;
  onApplyWorkspaceEdit?: (edit:unknown)=>Promise<void>;
  onEditorReady?: OnMount;
  /** Optional real external LSP; the authorized workspace host provides the transport. */
  lsp?: {transport:LspTransport;workspaceRootUri:string;onStatus?:(status:'starting'|'ready'|'error'|'missing',detail?:string)=>void};
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
  document, onChange, onSave, savedVersion, onSelectionChange, onDiagnostics, onEditorReady, onNavigate, onApplyWorkspaceEdit,
  palette, themeId = 'agentsam-ide', readOnly = false, options, className, lsp,
  height = '100%', loading = 'Loading editor…',
}: AgentSamMonacoEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const lastSavedVersion=useRef<string|undefined>(undefined);
  const editorRef = useRef<Parameters<OnMount>[0]|null>(null);
  const [mountedEditor,setMountedEditor] = useState(false);
  const activeLsp = useRef<{client:LspClient;fileUri:string}|null>(null);
  const callbacks = useRef({ document, onSave, onSelectionChange, onDiagnostics, onEditorReady, onNavigate, onApplyWorkspaceEdit });
  callbacks.current = { document, onSave, onSelectionChange, onDiagnostics, onEditorReady, onNavigate, onApplyWorkspaceEdit };

  const uri = useMemo(() => workspaceDocumentUri(document), [document.workspaceId, document.path]);
  const language = document.languageId || languageIdFromPath(document.path);

  const beforeMount: BeforeMount = (monaco) => {
    if (palette) defineAgentSamEditorTheme(monaco, themeId, palette);
  };

  const mount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    setMountedEditor(true);
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
      run: async (ed) => {
        if (!callbacks.current.onSave) return;
        await callbacks.current.onSave(ed.getValue(), callbacks.current.document);
        const current=activeLsp.current;
        if(current?.client.initialized)await current.client.saved(current.fileUri);
      },
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
    if (!mountedEditor || !lsp || !monacoRef.current || !editorRef.current) return;
    const {transport,workspaceRootUri,onStatus}=lsp;
    if (!['rust','go','python','typescript','javascript'].includes(language))return;
    const model=monacoRef.current.editor.getModel(monacoRef.current.Uri.parse(uri));
    if (!model)return;
    let canceled=false;
    let attached:ReturnType<typeof attachLspToMonaco>|undefined;
    const root=workspaceRootUri.endsWith('/')?workspaceRootUri:workspaceRootUri+'/';
    const fileUri=new URL(document.path.split('/').map(encodeURIComponent).join('/'),root).toString();
    const client=new LspClient(transport,language,workspaceRootUri);
    const unsubscribeStatus=client.onStatus((status,detail)=>{if(!canceled)onStatus?.(status,detail);});
    activeLsp.current={client,fileUri};
    onStatus?.('starting');
    void (async()=>{
      try {
        await client.connect();
        if(canceled)return;
        await client.open(fileUri,language,editorRef.current?.getValue() ?? callbacks.current.document.text);
        if(canceled)return;
        attached=attachLspToMonaco(monacoRef.current!,editorRef.current!,client,{
          modelUri:uri,fileUri,languageId:language,
          applyWorkspaceEdit:async edit=>{
            if(!callbacks.current.onApplyWorkspaceEdit)throw new Error('lsp_workspace_rename_host_required');
            await callbacks.current.onApplyWorkspaceEdit(edit);
            return {edits:[]};
          },
          resolveLocation:async location=>{
            if(location.uri===fileUri)return null;
            await callbacks.current.onNavigate?.(location.uri,location.range);
            return null; // The host opens the authoritative file; never fabricate a Monaco model.
          },
        });
        // Actual READY comes from a diagnostic/feature response, not initialize alone.
      }catch(error){if(!canceled)onStatus?.('error',error instanceof Error?error.message:String(error));}
    })();
    return ()=>{canceled=true;unsubscribeStatus();attached?.dispose();activeLsp.current=null;void client.close();onStatus?.('missing');};
  }, [mountedEditor, uri, language, lsp?.transport, lsp?.workspaceRootUri]);

  useEffect(()=>{
    if(!savedVersion || savedVersion===lastSavedVersion.current)return;
    lastSavedVersion.current=savedVersion;
    const current=activeLsp.current;
    if(current?.client.initialized)void current.client.saved(current.fileUri).catch(()=>{});
  },[savedVersion]);

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
      key={uri}
      onChange={value => {
        const next=value??'';
        onChange(next, callbacks.current.document);
        const current=activeLsp.current;
        if(current?.client.initialized)void current.client.change(current.fileUri,next).catch(()=>{});
      }}
      saveViewState
      keepCurrentModel
      options={{ ...DEFAULT_OPTIONS, ...options, ...(readOnly !== undefined ? { readOnly } : {}) }}
    />
  );
}
