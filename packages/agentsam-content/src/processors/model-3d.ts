import { ascii, readU32LE, type ContentProcessor, type ProbeResult } from "./types.js";

/**
 * GLB probe: header + embedded glTF JSON chunk → meshes/materials/
 * textures/animations counts and (when accessors expose min/max)
 * a bounding box. This backs the generic ModelInspector contract
 * harvested from the Fuel & Free Time GLB editor.
 */
export const modelProcessor: ContentProcessor = {
  kind: "model",
  probe(b: Uint8Array): ProbeResult | null {
    if (b.length < 20) return null;
    if (ascii(b, 0, 4) !== "glTF") {
      // Textual glTF
      const head = ascii(b, 0, Math.min(200, b.length));
      if (head.includes('"asset"') && head.includes('"version"')) {
        return { kind: "model", mime: "model/gltf+json", bytes: b.length };
      }
      return null;
    }

    const result: ProbeResult = {
      kind: "model",
      mime: "model/gltf-binary",
      bytes: b.length,
      ext: { format: "glb", version: readU32LE(b, 4) },
    };

    // First chunk should be JSON
    const chunkLen = readU32LE(b, 12);
    const chunkType = ascii(b, 16, 4);
    if (chunkType === "JSON" && b.length >= 20 + chunkLen) {
      try {
        const json = JSON.parse(new TextDecoder().decode(b.subarray(20, 20 + chunkLen))) as {
          meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number> }> }>;
          materials?: unknown[];
          textures?: unknown[];
          animations?: unknown[];
          accessors?: Array<{ min?: number[]; max?: number[]; type?: string }>;
        };
        const triangleEstimate = (json.meshes ?? []).length;
        result.ext = {
          ...result.ext,
          meshes: json.meshes?.length ?? 0,
          materials: json.materials?.length ?? 0,
          textures: json.textures?.length ?? 0,
          animations: json.animations?.length ?? 0,
        };
        // Bounding box from POSITION accessors' min/max
        const positions = (json.accessors ?? []).filter(
          (a) => a.type === "VEC3" && a.min?.length === 3 && a.max?.length === 3,
        );
        if (positions.length > 0) {
          const min: [number, number, number] = [Infinity, Infinity, Infinity];
          const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
          for (const a of positions) {
            for (let i = 0; i < 3; i++) {
              min[i] = Math.min(min[i]!, a.min![i]!) as never;
              max[i] = Math.max(max[i]!, a.max![i]!) as never;
            }
          }
          result.ext = { ...result.ext, boundingBox: { min, max } };
        }
        void triangleEstimate;
      } catch {
        // JSON chunk unreadable — header facts still stand
      }
    }
    return result;
  },
};
