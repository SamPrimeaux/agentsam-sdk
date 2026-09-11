import { languageFromPath, uid } from "@/lib/utils";
import type { Artifact } from "@/lib/work/types";

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

function looksLikePath(value: string) {
  if (!value) return false;
  if (/\s/.test(value)) return false;
  if (value.includes("/") || value.includes(".")) return true;
  return false;
}

function parseFenceInfo(info: string, body: string): { language: string; path: string | null } {
  const raw = info.trim();
  const filenameMatch =
    /(?:filename|title|file|path)\s*=\s*["']?([^\s"']+)/i.exec(raw) ??
    /(?:filename|title|file|path):\s*([^\s]+)/i.exec(raw);

  if (filenameMatch?.[1]) {
    const path = filenameMatch[1].replace(/[,"']+$/g, "");
    const langToken = raw.split(/\s+/)[0] ?? "";
    const language = looksLikePath(langToken) ? languageFromPath(path) : langToken || languageFromPath(path);
    return { language: language || "plaintext", path };
  }

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && looksLikePath(parts[1] ?? "")) {
    return { language: parts[0] || languageFromPath(parts[1]!), path: parts[1]! };
  }
  if (parts.length === 1 && looksLikePath(parts[0] ?? "")) {
    return { language: languageFromPath(parts[0]!), path: parts[0]! };
  }

  const first = body.split("\n", 3).slice(0, 2).join("\n");
  const fileLine =
    /(?:^|\n)\s*(?:\/\/|#|--)\s*(?:file(?:name|path)?|path)\s*:\s*(\S+)/i.exec(first);
  if (fileLine?.[1]) {
    return { language: parts[0] || languageFromPath(fileLine[1]), path: fileLine[1] };
  }

  return { language: parts[0] || "plaintext", path: null };
}

export function extractArtifacts(markdown: string, trailId?: string): Artifact[] {
  const out: Artifact[] = [];
  let index = 0;
  for (const match of markdown.matchAll(FENCE_RE)) {
    const info = match[1] ?? "";
    const content = (match[2] ?? "").replace(/\n$/, "");
    if (!content.trim()) continue;
    const { language, path } = parseFenceInfo(info, content);
    const lines = content.split("\n").length;
    const keep = Boolean(path) || (language !== "plaintext" && lines >= 4);
    if (!keep) continue;
    const resolved =
      path ?? `snippet-${index + 1}.${language === "plaintext" ? "txt" : language}`;
    out.push({
      id: uid(),
      path: resolved.replace(/^\/+/, ""),
      language: language || languageFromPath(resolved),
      content,
      updatedAt: Date.now(),
      kind: "code",
      origin: "chat",
      trailId,
    });
    index += 1;
  }
  return out;
}

export function mergeArtifacts(existing: Artifact[], incoming: Artifact[]) {
  const next = [...existing];
  for (const file of incoming) {
    const i = next.findIndex((f) => f.path === file.path);
    if (i >= 0) {
      next[i] = {
        ...next[i]!,
        content: file.content,
        language: file.language,
        updatedAt: file.updatedAt,
        kind: file.kind ?? next[i]!.kind,
        origin: file.origin ?? next[i]!.origin,
        title: file.title ?? next[i]!.title,
        url: file.url ?? next[i]!.url,
        trailId: file.trailId ?? next[i]!.trailId,
      };
    } else {
      next.push(file);
    }
  }
  return next;
}

export function printTree(files: { path: string }[], dirs: string[] = [], cwd = "/") {
  const prefix = cwd === "/" ? "" : cwd.replace(/^\//, "") + "/";
  const names = new Set<string>();
  for (const dir of dirs) {
    const abs = dir.replace(/^\//, "");
    if (prefix && !abs.startsWith(prefix) && abs !== prefix.slice(0, -1)) continue;
    const rest = prefix ? abs.slice(prefix.length) : abs;
    if (!rest) continue;
    names.add(rest.split("/")[0]! + "/");
  }
  for (const file of files) {
    if (prefix && !file.path.startsWith(prefix) && file.path !== prefix.slice(0, -1)) continue;
    const rest = prefix ? file.path.slice(prefix.length) : file.path;
    if (!rest) continue;
    const head = rest.split("/")[0]!;
    names.add(rest.includes("/") ? `${head}/` : head);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function renderAsciiTree(files: { path: string }[]) {
  if (!files.length) return "(empty)";
  const lines = ["."];
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    const parts = file.path.split("/");
    lines.push(`${"  ".repeat(Math.max(0, parts.length - 1))}└─ ${parts[parts.length - 1]}`);
  }
  return lines.join("\n");
}
