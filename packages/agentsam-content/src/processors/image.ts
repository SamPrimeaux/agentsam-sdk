import { ascii, readU16BE, readU16LE, readU32BE, readU32LE, type ContentProcessor, type ProbeResult } from "./types.js";

/** PNG / JPEG / GIF / WebP probe: mime, dimensions, alpha. */
export const imageProcessor: ContentProcessor = {
  kind: "image",
  probe(b: Uint8Array): ProbeResult | null {
    if (b.length < 12) return null;

    // PNG
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      const width = readU32BE(b, 16);
      const height = readU32BE(b, 20);
      const colorType = b[25]!;
      return {
        kind: "image",
        mime: "image/png",
        width,
        height,
        hasAlpha: colorType === 4 || colorType === 6,
        bytes: b.length,
      };
    }

    // JPEG
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) break;
        const marker = b[o + 1]!;
        const size = readU16BE(b, o + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return {
            kind: "image",
            mime: "image/jpeg",
            height: readU16BE(b, o + 5),
            width: readU16BE(b, o + 7),
            hasAlpha: false,
            bytes: b.length,
          };
        }
        o += 2 + size;
      }
      return { kind: "image", mime: "image/jpeg", hasAlpha: false, bytes: b.length };
    }

    // GIF
    if (ascii(b, 0, 3) === "GIF") {
      return {
        kind: "image",
        mime: "image/gif",
        width: readU16LE(b, 6),
        height: readU16LE(b, 8),
        hasAlpha: true,
        bytes: b.length,
      };
    }

    // WebP (RIFF....WEBP)
    if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
      const result: ProbeResult = { kind: "image", mime: "image/webp", bytes: b.length };
      const chunk = ascii(b, 12, 4);
      if (chunk === "VP8X" && b.length >= 30) {
        result.width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
        result.height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
        result.hasAlpha = (b[20]! & 0x10) !== 0;
      } else if (chunk === "VP8L" && b.length >= 25) {
        const bits = readU32LE(b, 21);
        result.width = (bits & 0x3fff) + 1;
        result.height = ((bits >> 14) & 0x3fff) + 1;
        result.hasAlpha = ((bits >> 28) & 1) === 1;
      } else if (chunk === "VP8 " && b.length >= 30) {
        result.width = readU16LE(b, 26) & 0x3fff;
        result.height = readU16LE(b, 28) & 0x3fff;
        result.hasAlpha = false;
      }
      return result;
    }

    // SVG (text sniff)
    const headText = ascii(b, 0, Math.min(256, b.length));
    if (headText.includes("<svg")) {
      return { kind: "image", mime: "image/svg+xml", hasAlpha: true, bytes: b.length };
    }

    return null;
  },
};
