import { useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { Artifact } from "@/lib/work/types";
import { hexNoHash, readTheme, type StoredTheme } from "@/lib/work/theme";

const THEME = "agentsam";
let monacoRef: Parameters<OnMount>[1] | null = null;

function paint(monaco: Parameters<OnMount>[1], theme: StoredTheme) {
  const t = theme.tokens;
  monaco.editor.defineTheme(THEME, {
    base: theme.monacoBase,
    inherit: true,
    rules: [
      { token: "comment", foreground: hexNoHash(t.clay) },
      { token: "string", foreground: hexNoHash(t.stone) },
      { token: "keyword", foreground: hexNoHash(t.foreground) },
    ],
    colors: {
      "editor.background": t.background,
      "editor.foreground": t.foreground,
      "editorLineNumber.foreground": t.clay,
      "editorLineNumber.activeForeground": t.stone,
      "editor.lineHighlightBackground": t.card,
      "editorCursor.foreground": t.ring,
      "editor.selectionBackground": `${t.accent}33`,
      "editorGutter.background": t.background,
      "editorWidget.background": t.card,
      "editorWidget.border": t.border,
      "editorIndentGuide.background": t.border,
      "editorIndentGuide.activeBackground": t.input,
    },
  });
  monaco.editor.setTheme(THEME);
}

export function MonacoPane({ file, onChange }: { file: Artifact; onChange: (value: string) => void }) {
  useEffect(() => {
    function onTheme(event: Event) {
      if (!monacoRef) return;
      const detail = (event as CustomEvent<StoredTheme>).detail ?? readTheme();
      paint(monacoRef, detail);
    }
    window.addEventListener("agentsam:theme", onTheme);
    return () => window.removeEventListener("agentsam:theme", onTheme);
  }, []);

  const onMount: OnMount = (editor, monaco) => {
    monacoRef = monaco;
    paint(monaco, readTheme());
    editor.addAction({
      id: "agentsam.format",
      label: "Format document",
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: async (ed) => {
        await ed.getAction("editor.action.formatDocument")?.run();
      },
    });
    editor.focus();
  };

  return (
    <Editor
      height="100%"
      theme={THEME}
      path={file.path}
      language={file.language}
      value={file.content}
      onChange={(value) => onChange(value ?? "")}
      onMount={onMount}
      loading={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading Monaco</div>}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "IBM Plex Mono, ui-monospace, SF Mono, Menlo, monospace",
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        formatOnPaste: true,
        bracketPairColorization: { enabled: true },
        guides: { indentation: true },
        mouseWheelZoom: true,
      }}
    />
  );
}
