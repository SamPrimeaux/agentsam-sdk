import { useEffect, useMemo, useState } from 'react';
import { AgentSamMonacoEditor, type AgentSamEditorPalette } from '@inneranimalmedia/agentsam-ide/monaco';
import type { Artifact } from '@inneranimalmedia/agentsam-local-shared';
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
export function MonacoPane({ file, workspaceId, onChange, onSave }: {
  file: Artifact;
  workspaceId: string;
  onChange: (value: string) => void;
  onSave?: (value: string) => void | Promise<void>;
}) {
  const [theme, setTheme] = useState<StoredTheme>(readTheme);
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
  if (runtimeError) return <div role="alert" className="p-3 text-sm text-destructive">Monaco failed to start: {runtimeError}</div>;
  if (!runtimeReady) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading local Monaco runtime…</div>;
  return (
    <AgentSamMonacoEditor
      document={{ workspaceId, path: file.path, text: file.content, languageId: file.language }}
      onChange={onChange}
      onSave={onSave}
      palette={palette}
      loading={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading Monaco</div>}
    />
  );
}
