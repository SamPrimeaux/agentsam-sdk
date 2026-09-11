import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return crypto.randomUUID();
}

export function shortTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function titleFromText(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "New trail";
  return line.length > 42 ? `${line.slice(0, 42).trimEnd()}…` : line;
}

export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

export function extForLanguage(language: string) {
  const map: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    tsx: "tsx",
    jsx: "jsx",
    python: "py",
    rust: "rs",
    go: "go",
    ruby: "rb",
    json: "json",
    yaml: "yml",
    markdown: "md",
    html: "html",
    css: "css",
    bash: "sh",
    shell: "sh",
    sql: "sql",
    swift: "swift",
    kotlin: "kt",
    java: "java",
    c: "c",
    cpp: "cpp",
    toml: "toml",
  };
  return map[language.toLowerCase()] ?? (language.length <= 4 ? language : "txt");
}

export function languageFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    html: "html",
    css: "css",
    sh: "shell",
    sql: "sql",
    swift: "swift",
    kt: "kotlin",
    java: "java",
    toml: "toml",
    svg: "xml",
  };
  return map[ext] ?? "plaintext";
}
