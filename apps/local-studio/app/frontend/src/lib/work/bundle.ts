import { strToU8, zipSync } from "fflate";
import type { Artifact } from "@/lib/work/types";

export function zipProject(files: Artifact[], name: string) {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    const path = file.path.replace(/^\/+/, "");
    if (!path) continue;
    entries[path] = strToU8(file.content);
  }
  if (!Object.keys(entries).length) {
    entries["README.md"] = strToU8(`# ${name}\n`);
  }
  return zipSync(entries, { level: 6 });
}

export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(content: string, filename: string) {
  downloadBytes(strToU8(content), filename, "text/plain;charset=utf-8");
}
