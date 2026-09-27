import type { ContentKind } from "../core/asset.js";

const MIME_KIND: Array<[RegExp, ContentKind]> = [
  [/^image\//, "image"],
  [/^video\//, "video"],
  [/^model\//, "model"],
  [/^audio\//, "audio"],
  [/^font\//, "font"],
  [/^application\/pdf$/, "document"],
  [/^text\//, "document"],
];

const EXT_KIND: Record<string, ContentKind> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image", svg: "image",
  mp4: "video", mov: "video", webm: "video", mkv: "video",
  glb: "model", gltf: "model", usdz: "model", obj: "model", fbx: "model",
  mp3: "audio", wav: "audio", flac: "audio", m4a: "audio", ogg: "audio",
  pdf: "document", doc: "document", docx: "document", md: "document", txt: "document",
  woff: "font", woff2: "font", ttf: "font", otf: "font",
};

/** Deterministic kind classification from mime and/or filename. */
export function classifyKind(input: { mime?: string; filename?: string }): ContentKind | undefined {
  if (input.mime) {
    for (const [re, kind] of MIME_KIND) {
      if (re.test(input.mime)) return kind;
    }
  }
  if (input.filename) {
    const ext = input.filename.split(".").pop()?.toLowerCase();
    if (ext && EXT_KIND[ext]) return EXT_KIND[ext];
  }
  return undefined;
}
