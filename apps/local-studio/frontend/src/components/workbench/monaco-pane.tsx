import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentSamMonacoEditor, type AgentSamEditorPalette } from '@inneranimalmedia/agentsam-ide/monaco';
import type { Artifact } from '@inneranimalmedia/agentsam-local-shared';
import { HttpLspTransport, workspaceRootFileUri } from '@inneranimalmedia/agentsam-ide/lsp';
import { readTheme, type StoredTheme } from '@/lib/work/theme';

function fromLocalStudioTheme(theme: StoredTheme): AgentSamEditorPalette {
  const t = theme.tokens;
  return {
    base: theme.monacoBase,
    background: t.background,
    foreground: t.foreground,
    panel: t.card,
    border: t.border,
    muted: t.clay,
    accent: t.ring,
    comment: t.clay,
    string: t.stone,
    keyword: t.foreground,
  };
}

/** Local Studio owns theme state and persistence; the editing engine is packaged in agentsam-ide. */
export function MonacoPane({ file, workspaceId, onChange, onSave, runtimeBaseUrl, runtimeCapability, workspaceRoot, onLspStatus, onNavigate, onApplyWorkspaceEdit, navigationTarget, savedVersion, lspRetry }: {
  file: Artifact;
  workspaceId: string;
  onChange: (value: string) => void;
  onSave?: (value: string) => void | Promise<void>;
  savedVersion?: string;
  lspRetry?: number;
  runtimeBaseUrl?: string;
  runtimeCapability?: string | null;
  workspaceRoot?: string;
  onLspStatus?: (status: 'starting'|'ready'|'error'|'missing', detail?: string) => void;
  onNavigate?: (uri:string, range:{start:{line:number;character:number};end:{line:number;character:number}})=>void|Promise<void>;
  onApplyWorkspaceEdit?: (edit:unknown)=>Promise<void>;
  navigationTarget?: {path:string;line:number;column:number};
}) {
  const [theme, setTheme] = useState<StoredTheme>(readTheme);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor|null>(null);
  useEffect(()=>{
    if(navigationTarget?.path===file.path && file.content && editorRef.current){
      editorRef.current.setPosition({lineNumber:navigationTarget.line,column:navigationTarget.column});
      editorRef.current.revealLineInCenter(navigationTarget.line);
      editorRef.current.focus();
    }
  },[navigationTarget,file.path,file.content]);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    // Deliberately browser-only: Monaco + its language workers must not be bundled into the Worker SSR entry.
    if (!import.meta.env.SSR) {
      void import('./monaco-runtime').then(() => { if (mounted) setRuntimeReady(true); }).catch(error => {
        if (mounted) setRuntimeError(error instanceof Error ? error.message : 'Monaco runtime unavailable');
      });
    }
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const updated = (event: Event) => setTheme((event as CustomEvent<StoredTheme>).detail ?? readTheme());
    window.addEventListener('agentsam:theme', updated);
    return () => window.removeEventListener('agentsam:theme', updated);
  }, []);
  const palette = useMemo(() => fromLocalStudioTheme(theme), [theme]);
  // Optional real LSP: the editor never owns credentials, processes, or filesystem access.
  const lsp = useMemo(() => {
    if (!runtimeBaseUrl || !runtimeCapability || !workspaceRoot) return undefined;
    const rootUri = workspaceRootFileUri(workspaceRoot);
    return { transport:new HttpLspTransport(runtimeBaseUrl,runtimeCapability), workspaceRootUri:rootUri, onStatus:onLspStatus };
  }, [runtimeBaseUrl,runtimeCapability,workspaceRoot,lspRetry]);
  if (runtimeError) return <div role="alert" className="p-3 text-sm text-destructive">Monaco failed to start: {runtimeError}</div>;
  if (!runtimeReady) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading local Monaco runtime…</div>;
  return (
    <AgentSamMonacoEditor
      document={{ workspaceId, path: file.path, text: file.content, languageId: file.language }}
      onChange={onChange}
      onNavigate={onNavigate}
      onApplyWorkspaceEdit={onApplyWorkspaceEdit}
      onEditorReady={(editor)=>{editorRef.current=editor;}}
      onSave={onSave}
      savedVersion={savedVersion}
      palette={palette}
      lsp={lsp}
      loading={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading Monaco</div>}
    />
  );
}
