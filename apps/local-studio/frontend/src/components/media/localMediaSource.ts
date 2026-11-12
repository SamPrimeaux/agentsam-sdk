/** Read-only local gallery adapter using the existing LocalContentHost seam. */
import type { LocalContentHost, LocalDirectoryRef, LocalFileRef } from "@inneranimalmedia/agentsam-content";
import { classifyAsset, guessMime, type MediaAsset } from "./media-utils";

const MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
const MAX_LIST_ENTRIES = 500;
const MAX_PREVIEW_COUNT = 32;
const MAX_TOTAL_PREVIEW_BYTES = 48 * 1024 * 1024;

export async function listLocalMedia(
  host: LocalContentHost,
  directory: LocalDirectoryRef,
): Promise<{ assets: MediaAsset[]; previewUrls: string[]; truncated: boolean }> {
  const entries = await host.list(directory);
  const assets: MediaAsset[] = [];
  const previewUrls: string[] = [];
  let previewBudget = MAX_TOTAL_PREVIEW_BYTES;
  for (const entry of entries.slice(0, MAX_LIST_ENTRIES)) {
    let size = entry.bytes;
    let mime = entry.mime || guessMime(entry.name);
    let modified = entry.mtime;
    try {
      if (entry.kind === "file" && (!size || !entry.mime || !modified)) {
        const stat = await host.stat(entry.ref);
        size = stat.bytes ?? size;
        mime = stat.mime || mime;
        modified = stat.mtime || modified;
      }
    } catch { /* Missing local files remain represented, never assumed uploaded. */ }
    const asset: MediaAsset = {
      id: `local:${entry.ref}`,
      filename: entry.name,
      source: "local",
      local_ref: entry.ref,
      local_directory: entry.kind === "directory",
      content_type: entry.kind === "directory" ? "inode/directory" : mime,
      size_bytes: size,
      created_at: modified || null,
    };
    const sizeBytes = Number(size);
    if (entry.kind === "file" && Number.isFinite(sizeBytes) &&
      sizeBytes >= 0 && sizeBytes <= MAX_PREVIEW_BYTES && sizeBytes <= previewBudget &&
      previewUrls.length < MAX_PREVIEW_COUNT &&
      mime !== "image/svg+xml" && !/\.svg$/i.test(entry.name) &&
      (classifyAsset(asset) === "image" || classifyAsset(asset) === "video")) {
      try {
        const reader = await host.openRead(entry.ref as LocalFileRef);
        const bytes = await reader.read(MAX_PREVIEW_BYTES);
        const blob = new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: mime });
        const url = URL.createObjectURL(blob);
        asset.url = url;
        asset.thumbnail_url = url;
        previewUrls.push(url);
        previewBudget -= sizeBytes;
        await reader.close?.();
      } catch { /* Display a real file-type glyph when preview is unavailable. */ }
    }
    assets.push(asset);
  }
  return { assets, previewUrls, truncated: entries.length > MAX_LIST_ENTRIES };
}
