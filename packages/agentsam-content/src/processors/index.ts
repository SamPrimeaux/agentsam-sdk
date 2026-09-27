import { imageProcessor } from "./image.js";
import { videoProcessor } from "./video.js";
import { modelProcessor } from "./model-3d.js";
import { documentProcessor } from "./document.js";
import type { ProbeResult } from "./types.js";

export * from "./types.js";
export { imageProcessor } from "./image.js";
export { videoProcessor } from "./video.js";
export { modelProcessor } from "./model-3d.js";
export { documentProcessor } from "./document.js";

const ALL = [imageProcessor, videoProcessor, modelProcessor, documentProcessor];

/** Run every processor until one recognizes the bytes. */
export function probeBytes(bytes: Uint8Array): ProbeResult | null {
  for (const p of ALL) {
    const result = p.probe(bytes);
    if (result) return result;
  }
  return null;
}
