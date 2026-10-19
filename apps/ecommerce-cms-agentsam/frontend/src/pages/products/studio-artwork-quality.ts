import { effectiveArtworkDpi, providerPrintSizeIn } from "../../../../packages/agentsam-merch/src/index.js";
import type { PrintLocation } from "./studio-model";

export type ArtworkCrop = { x: number; y: number; width: number; height: number };

export function studioArtworkQuality(input: {
  location?: PrintLocation;
  source?: { width: number; height: number } | null;
  crop?: ArtworkCrop | null;
  cropPending?: boolean;
  scalePercent: number;
  fileName?: string | null;
}) {
  const extension = input.fileName?.split(".").pop()?.toLowerCase();
  if (extension === "svg") {
    return { badge: "Vector", aria: "Vector artwork", detail: "Vector artwork has no fixed raster DPI", lowResolution: false, result: null };
  }
  // A PDF can contain raster imagery, so do not promise vector quality merely
  // from a filename. The app retains PDFs as source and requests PNG preview.
  if (extension === "pdf") {
    return { badge: "PDF", aria: "PDF artwork requires inspection", detail: "Inspect the PDF contents before assigning a DPI", lowResolution: false, result: null };
  }
  const physical = providerPrintSizeIn(input.location);
  if (!physical || !input.source || input.cropPending) {
    return { badge: "DPI —", aria: "DPI unavailable", detail: input.cropPending ? "Inspecting artwork crop" : "Source pixels or provider print dimensions unavailable", lowResolution: false, result: null };
  }
  const result = effectiveArtworkDpi({
    sourceWidthPx: input.source.width,
    sourceHeightPx: input.source.height,
    cropWidthPx: input.crop?.width ?? input.source.width,
    cropHeightPx: input.crop?.height ?? input.source.height,
    printWidthIn: physical.width,
    printHeightIn: physical.height,
    placementWidthPercent: input.scalePercent,
  });
  const target = Number(input.location?.dpi);
  return {
    badge: result ? `${result.dpi} DPI` : "DPI —",
    aria: result ? `Effective print resolution ${result.dpi} DPI` : "DPI unavailable",
    detail: result
      ? `${input.crop?.width ?? input.source.width} × ${input.crop?.height ?? input.source.height} source pixels at ${result.printedWidthIn.toFixed(1)} × ${result.printedHeightIn.toFixed(1)} printed inches`
      : "Unable to calculate effective DPI",
    // Compare threshold against the unrounded physical result; no premature floor.
    lowResolution: Boolean(result && Number.isFinite(target) && target > 0 && result.exactDpi < target),
    result,
  };
}
