import {
  mediaKindForFormat,
  normalizeFormat,
  normalizeManufacturingProfile,
} from "./profile.js";

export const COMPATIBILITY_STATUS = Object.freeze({
  READY: "ready",
  READY_WITH_TRANSFORM: "ready_with_transform",
  NEEDS_VARIANT: "needs_variant",
  PREPARED_FOR_DIGITIZATION: "prepared_for_digitization",
  UNSUPPORTED: "unsupported",
});

const severity = Object.freeze({
  [COMPATIBILITY_STATUS.READY]: 0,
  [COMPATIBILITY_STATUS.READY_WITH_TRANSFORM]: 1,
  [COMPATIBILITY_STATUS.PREPARED_FOR_DIGITIZATION]: 2,
  [COMPATIBILITY_STATUS.NEEDS_VARIANT]: 3,
  [COMPATIBILITY_STATUS.UNSUPPORTED]: 4,
});

function addIssue(issues, status, code, message, action = null) {
  issues.push(Object.freeze({ status, code, message, action }));
}

function normalizeAsset(input = {}) {
  const mimeFormat = input.mimeType?.split("/").pop();
  const format = normalizeFormat(input.format || input.extension || mimeFormat);
  return Object.freeze({
    ...input,
    format,
    mediaKind: input.mediaKind || mediaKindForFormat(format),
    widthPx: Number(input.widthPx || input.width || 0) || null,
    heightPx: Number(input.heightPx || input.height || 0) || null,
    bytes: Number(input.bytes || input.sizeBytes || 0) || null,
    colorSpace: input.colorSpace ? String(input.colorSpace).toLowerCase() : null,
    colorMode: input.colorMode ? String(input.colorMode).toLowerCase() : null,
    hasAlpha: typeof input.hasAlpha === "boolean" ? input.hasAlpha : null,
    hasGradients: input.hasGradients === true,
    hasOpenPaths: input.hasOpenPaths === true,
    hasLiveText: input.hasLiveText === true,
  });
}

function effectivePpi(asset, profile, target = {}) {
  if (asset.mediaKind !== "raster" || !asset.widthPx || !asset.heightPx) return null;
  const widthIn = Number(target.printWidthIn || profile.preferredPrintWidthIn || 0);
  const heightIn = Number(target.printHeightIn || profile.preferredPrintHeightIn || 0);
  const samples = [];
  if (widthIn > 0) samples.push(asset.widthPx / widthIn);
  if (heightIn > 0) samples.push(asset.heightPx / heightIn);
  return samples.length ? Math.min(...samples) : null;
}

export function evaluateManufacturingCompatibility(assetInput, profileInput, target = {}) {
  const asset = normalizeAsset(assetInput);
  const profile = normalizeManufacturingProfile(profileInput);
  const issues = [];

  if (!asset.format || asset.mediaKind === "unknown") {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.UNSUPPORTED,
      "unknown_source_format",
      "The source format cannot be classified safely.",
    );
  }

  if (asset.mediaKind === "raster" && !profile.allowRaster) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "raster_not_allowed",
      "This manufacturing profile requires a non-raster production variant.",
      "build_vector_or_process_specific_variant",
    );
  }

  if (asset.mediaKind === "vector" && !profile.allowVector) {
    if (profile.allowRaster) {
      addIssue(
        issues,
        COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
        "vector_requires_rasterization",
        `Rasterize the vector master to ${profile.format}.`,
        `rasterize:${profile.format}`,
      );
    } else {
      addIssue(
        issues,
        COMPATIBILITY_STATUS.NEEDS_VARIANT,
        "vector_not_allowed",
        "This manufacturing profile does not accept the source media kind.",
      );
    }
  }

  if (asset.format && profile.format && asset.format !== profile.format) {
    const targetKind = mediaKindForFormat(profile.format);
    const conversionAllowed =
      (targetKind === "raster" && ["raster", "vector"].includes(asset.mediaKind)) ||
      (targetKind === "vector" && asset.mediaKind === "vector");
    addIssue(
      issues,
      conversionAllowed
        ? COMPATIBILITY_STATUS.READY_WITH_TRANSFORM
        : COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "format_mismatch",
      `Production format is ${profile.format}; source is ${asset.format}.`,
      conversionAllowed ? `convert:${profile.format}` : "build_process_specific_variant",
    );
  }

  if (profile.colorSpace && asset.colorSpace && asset.colorSpace !== profile.colorSpace) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
      "color_space_mismatch",
      `Convert ${asset.colorSpace} to ${profile.colorSpace}.`,
      `convert_color_space:${profile.colorSpace}`,
    );
  }

  if (profile.colorMode === "monochrome" && asset.colorMode !== "monochrome") {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
      "monochrome_required",
      "Create a monochrome production variant.",
      "convert_monochrome",
    );
  }

  if (!profile.allowGradients && asset.hasGradients) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "gradients_not_allowed",
      "Gradients must be simplified for this manufacturing process.",
      "simplify_gradients",
    );
  }

  if (profile.requireClosedPaths && asset.mediaKind === "vector" && asset.hasOpenPaths) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "closed_paths_required",
      "Open vector paths must be closed before production.",
      "close_paths",
    );
  }

  if (profile.outlineText && asset.mediaKind === "vector" && asset.hasLiveText) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
      "outline_text_required",
      "Convert live text to outlines.",
      "outline_text",
    );
  }

  if (profile.requireAlpha && asset.mediaKind === "raster" && asset.hasAlpha === false) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "alpha_required",
      "This production profile requires transparent artwork.",
      "build_transparent_variant",
    );
  }

  const ppi = effectivePpi(asset, profile, target);
  if (profile.ppi && ppi != null && ppi < profile.ppi) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "insufficient_resolution",
      `Effective resolution is ${Math.round(ppi)} PPI; target is ${Math.round(profile.ppi)} PPI.`,
      "replace_with_higher_resolution_master",
    );
  }

  if (profile.maxBytes && asset.bytes && asset.bytes > profile.maxBytes) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
      "file_too_large",
      `Source exceeds the ${profile.maxBytes}-byte profile limit.`,
      "lossless_optimize",
    );
  }

  let status = issues.reduce(
    (current, issue) => (severity[issue.status] > severity[current] ? issue.status : current),
    COMPATIBILITY_STATUS.READY,
  );

  if (
    ![COMPATIBILITY_STATUS.UNSUPPORTED, COMPATIBILITY_STATUS.NEEDS_VARIANT].includes(status) &&
    profile.handoff?.status === COMPATIBILITY_STATUS.PREPARED_FOR_DIGITIZATION
  ) {
    status = COMPATIBILITY_STATUS.PREPARED_FOR_DIGITIZATION;
  }

  const requirementsVerified = profile.source?.verified !== false;

  return Object.freeze({
    profileId: profile.id,
    manufacturer: profile.manufacturer,
    process: profile.process,
    status,
    requirementsVerified,
    productionReady: status === COMPATIBILITY_STATUS.READY && requirementsVerified,
    transformReady: status === COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
    effectivePpi: ppi == null ? null : Math.round(ppi * 10) / 10,
    target: Object.freeze({
      format: profile.format,
      ppi: profile.ppi,
      printWidthIn:
        Number(target.printWidthIn || profile.preferredPrintWidthIn || 0) || null,
      printHeightIn:
        Number(target.printHeightIn || profile.preferredPrintHeightIn || 0) || null,
    }),
    issues: Object.freeze(issues),
    actions: Object.freeze([...new Set(issues.map((issue) => issue.action).filter(Boolean))]),
    handoff: profile.handoff,
  });
}
