/**
 * Canonical portable manufacturing geometry: @inneranimalmedia/agentsam-merch.
 * This is authoritative for physical print-area units and raster source PPI.
 * Never use browser zoom, storefront derivatives, or AI-resampled dimensions
 * as if they were verified original pixels.
 *
 *
 * Effective raster pixels per printed inch along the layer's own axes.
 *
 * The editor's width % means final artwork width as a percentage of the
 * provider print-area width, AFTER any crop/trim. Rotation and viewport zoom
 * do not alter this measurement; they affect positioning, not pixel density.
 *
 * Optional placementHeightPercent is an explicit NON-UNIFORM stretch relative
 * to provider print-area height. Omit it for aspect-ratio-preserving placement.
 *
 * Crop bounds refer to original source pixels (never an upscaled derivative).
 * Consumers MUST use the same crop for rendering, preflight, and export.
 */
export function effectiveArtworkDpi({
  sourceWidthPx, sourceHeightPx, cropWidthPx = sourceWidthPx,
  cropHeightPx = sourceHeightPx, printWidthIn, printHeightIn,
  placementWidthPercent, placementHeightPercent,
}) {
  const inputs = [sourceWidthPx, sourceHeightPx, cropWidthPx, cropHeightPx,
    printWidthIn, printHeightIn, placementWidthPercent];
  if (placementHeightPercent != null) inputs.push(placementHeightPercent);
  if (!inputs.every((value) => Number.isFinite(value) && value > 0)) return null;
  if (cropWidthPx > sourceWidthPx || cropHeightPx > sourceHeightPx) return null;

  const placedWidthIn = printWidthIn * placementWidthPercent / 100;
  const placedHeightIn = placementHeightPercent == null
    ? placedWidthIn * cropHeightPx / cropWidthPx
    : printHeightIn * placementHeightPercent / 100;
  const exactDpi = Math.min(cropWidthPx / placedWidthIn, cropHeightPx / placedHeightIn);

  return {
    dpi: Math.floor(exactDpi),
    exactDpi,
    dpiX: cropWidthPx / placedWidthIn,
    dpiY: cropHeightPx / placedHeightIn,
    printedWidthIn: placedWidthIn,
    printedHeightIn: placedHeightIn,
    fitsPrintHeight: placedHeightIn <= printHeightIn,
  };
}

/** Convert provider-declared units to inches; do not guess missing units. */
export function providerPrintSizeIn(location) {
  if (!location) return null;
  const unit = String(location.unit || "").toLowerCase();
  const factor = { in: 1, inch: 1, inches: 1, cm: 1 / 2.54, mm: 1 / 25.4 }[unit]
    ?? (["px", "pixel", "pixels"].includes(unit) && Number(location.dpi) > 0 ? 1 / location.dpi : null);
  if (!factor || !(Number(location.file_width) > 0 && Number(location.file_height) > 0)) return null;
  return {
    width: Math.round(Number(location.file_width) * factor * 1e6) / 1e6,
    height: Math.round(Number(location.file_height) * factor * 1e6) / 1e6,
  };
}

/** Preflight source PPI without implying that a transform recovered detail. */
export function rasterResolutionPreflight({ sourceWidthPx, sourceHeightPx,
  cropWidthPx = sourceWidthPx, cropHeightPx = sourceHeightPx,
  printWidthIn, printHeightIn, placementWidthPercent,
  placementHeightPercent, targetPpi = null }) {
  const ratio = placementWidthPercent == null ? 100 : placementWidthPercent;
  const result = effectiveArtworkDpi({ sourceWidthPx, sourceHeightPx,
    cropWidthPx, cropHeightPx, printWidthIn, printHeightIn,
    placementWidthPercent: ratio, placementHeightPercent });
  const threshold = Number(targetPpi);
  return Object.freeze({
    geometry: result,
    effectivePpi: result?.exactDpi ?? null,
    targetPpi: Number.isFinite(threshold) && threshold > 0 ? threshold : null,
    meetsTarget: result && Number.isFinite(threshold) && threshold > 0
      ? result.exactDpi >= threshold && result.fitsPrintHeight : null,
    requiredWidthPx: result && threshold > 0 ? Math.ceil(result.printedWidthIn * threshold) : null,
    requiredHeightPx: result && threshold > 0 ? Math.ceil(result.printedHeightIn * threshold) : null,
    status: !result || !Number.isFinite(threshold) || threshold <= 0
      ? "unverified" : result.exactDpi >= threshold && result.fitsPrintHeight ? "meets_resolution" : "needs_review",
  });
}
