import { useCallback, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";

export type SqlMonacoEditorProps = {
  value: string;
  onChange: (next: string) => void;
  onRun: () => void;
  height?: string | number;
  readOnly?: boolean;
  theme?: "vs-dark" | "light";
  path?: string;
};

/** Lightweight SQL canvas using the shared Monaco loader (same engine as agentsam-ide). */
export function SqlMonacoEditor({
  value,
  onChange,
  onRun,
  height = "100%",
  readOnly = false,
  theme = "vs-dark",
  path,
}: SqlMonacoEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () =>
        onRunRef.current(),
      );
      editor.addAction({
        id: "agentsam.db.formatSql",
        label: "Format SQL",
        keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: async (ed) => {
          await ed.getAction("editor.action.formatDocument")?.run();
        },
      });
    },
    [onRun],
  );

  return (
    <Editor
      language="sql"
      path={path}
      saveViewState
      keepCurrentModel
      theme={theme}
      value={value}
      height={height}
      onChange={(next) => onChange(next ?? "")}
      onMount={handleMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        renderLineHighlight: "line",
      }}
    />
  );
}

/** Deterministic SQL pretty-print for Format when Monaco formatter is unavailable. */
export function formatSqlFallback(sql: string): string {
  const trimmed = String(sql || "").trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",\n  ")
    .replace(
      /\b(SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|OUTER JOIN|UNION|INSERT INTO|VALUES|UPDATE|SET|DELETE FROM)\b/gi,
      "\n$1",
    )
    .replace(/^\n+/, "")
    .trim();
}
