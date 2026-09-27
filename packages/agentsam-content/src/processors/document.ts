import { ascii, type ContentProcessor, type ProbeResult } from "./types.js";

/** PDF and plain-text/document probe. */
export const documentProcessor: ContentProcessor = {
  kind: "document",
  probe(b: Uint8Array): ProbeResult | null {
    if (b.length < 4) return null;

    if (ascii(b, 0, 4) === "%PDF") {
      const text = new TextDecoder("latin1").decode(b);
      const pageMatches = text.match(/\/Type\s*\/Page[^s]/g);
      return {
        kind: "document",
        mime: "application/pdf",
        bytes: b.length,
        ext: { pages: pageMatches ? pageMatches.length : undefined },
      };
    }

    // OOXML (docx/xlsx/pptx) — ZIP magic
    if (b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) {
      return { kind: "document", mime: "application/zip", bytes: b.length };
    }

    // WOFF/WOFF2/TTF/OTF fonts
    const magic = ascii(b, 0, 4);
    if (magic === "wOFF") return { kind: "font", mime: "font/woff", bytes: b.length };
    if (magic === "wOF2") return { kind: "font", mime: "font/woff2", bytes: b.length };
    if (magic === "OTTO") return { kind: "font", mime: "font/otf", bytes: b.length };
    if (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) {
      return { kind: "font", mime: "font/ttf", bytes: b.length };
    }

    return null;
  },
};
