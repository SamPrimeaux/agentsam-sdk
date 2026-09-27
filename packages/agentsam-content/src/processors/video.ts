import { ascii, readU32BE, type ContentProcessor, type ProbeResult } from "./types.js";

/**
 * MP4/MOV probe: walks top-level boxes, finds moov/mvhd for duration,
 * tkhd for dimensions. WebM detected by EBML magic (no duration parse).
 */
export const videoProcessor: ContentProcessor = {
  kind: "video",
  probe(b: Uint8Array): ProbeResult | null {
    if (b.length < 12) return null;

    // MP4 family: [size]['ftyp']
    if (ascii(b, 4, 4) === "ftyp") {
      const brand = ascii(b, 8, 4);
      const mime = brand.startsWith("qt") ? "video/quicktime" : "video/mp4";
      const result: ProbeResult = { kind: "video", mime, bytes: b.length };

      const mvhd = findBox(b, "mvhd");
      if (mvhd !== null) {
        const version = b[mvhd + 8]!;
        if (version === 0 && b.length >= mvhd + 28) {
          const timescale = readU32BE(b, mvhd + 20);
          const duration = readU32BE(b, mvhd + 24);
          if (timescale > 0) result.durationMs = Math.round((duration / timescale) * 1000);
        } else if (version === 1 && b.length >= mvhd + 40) {
          const timescale = readU32BE(b, mvhd + 28);
          // 64-bit duration; high word usually 0 for real content
          const durationLo = readU32BE(b, mvhd + 36);
          if (timescale > 0) result.durationMs = Math.round((durationLo / timescale) * 1000);
        }
      }

      const tkhd = findBox(b, "tkhd");
      if (tkhd !== null) {
        const version = b[tkhd + 8]!;
        // width/height are 16.16 fixed point at the end of the tkhd body
        const widthOff = tkhd + 8 + (version === 1 ? 88 : 76);
        if (b.length >= widthOff + 8) {
          result.width = readU32BE(b, widthOff) >>> 16 || undefined;
          result.height = readU32BE(b, widthOff + 4) >>> 16 || undefined;
        }
      }
      return result;
    }

    // WebM / Matroska EBML
    if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
      return { kind: "video", mime: "video/webm", bytes: b.length };
    }

    return null;
  },
};

/** Depth-first scan for a box type; returns offset of the box start. */
function findBox(b: Uint8Array, type: string, start = 0, end = b.length, depth = 0): number | null {
  if (depth > 6) return null;
  let o = start;
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);
  while (o + 8 <= end) {
    const size = readU32BE(b, o);
    const boxType = ascii(b, o + 4, 4);
    if (size < 8) break;
    if (boxType === type) return o;
    if (containers.has(boxType)) {
      const found = findBox(b, type, o + 8, Math.min(o + size, end), depth + 1);
      if (found !== null) return found;
    }
    o += size;
  }
  return null;
}
