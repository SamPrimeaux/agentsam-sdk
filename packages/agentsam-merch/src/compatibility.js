import {
  mediaKindForFormat,
  normalizeFormat,
  normalizeManufacturingProfile,
} from "./profile.js";

export const COMPATIBILITY_STATUS = Object.freeze({
  READY: "ready",
  READY_WITH_WARNING: "ready_with_warning",
  READY_WITH_TRANSFORM: "ready_with_transform",
  PREPARED_FOR_DIGITIZATION: "prepared_for_digitization",
  NEEDS_VARIANT: "needs_variant",
  UNSUPPORTED: "unsupported",
});

const severity = Object.freeze({
  [COMPATIBILITY_STATUS.READY]: 0,
  [COMPATIBILITY_STATUS.READY_WITH_WARNING]: 1,
  [COMPATIBILITY_STATUS.READY_WITH_TRANSFORM]: 2,
  [COMPATIBILITY_STATUS.PREPARED_FOR_DIGITIZATION]: 3,
  [COMPATIBILITY_STATUS.NEEDS_VARIANT]: 4,
  [COMPATIBILITY_STATUS.UNSUPPORTED]: 5,
});

function addIssue(issues, status, code, message, action = null, meta = null) {
  issues.push(Object.freeze({ status, code, message, action, meta }));
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeAsset(input = {}) {
  const mimeFormat = input.mimeType?.split("/").pop();
  const format = normalizeFormat(input.format || input.extension || mimeFormat);
  const widthPx = numberOrNull(input.widthPx || input.width);
  const heightPx = numberOrNull(input.heightPx || input.height);
  const contentWidthPx =
    numberOrNull(input.contentWidthPx || input.trimmedWidthPx) || widthPx;
  const contentHeightPx =
    numberOrNull(input.contentHeightPx || input.trimmedHeightPx) || heightPx;

  return Object.freeze({
    ...input,
    format,
    mediaKind: input.mediaKind || mediaKindForFormat(format),
    widthPx,
    heightPx,
    contentWidthPx,
    contentHeightPx,
    bytes: numberOrNull(input.bytes || input.sizeBytes),
    colorSpace: input.colorSpace ? String(input.colorSpace).toLowerCase() : null,
    colorMode: input.colorMode ? String(input.colorMode).toLowerCase() : null,
    hasAlpha: typeof input.hasAlpha === "boolean" ? input.hasAlpha : null,
    transparentBorderDetected: input.transparentBorderDetected === true,
    isAlphaTrimmed: input.isAlphaTrimmed === true,
    hasGradients: input.hasGradients === true,
    hasOpenPaths: input.hasOpenPaths === true,
    hasLiveText: input.hasLiveText === true,
    hasExplicitViewBox:
      typeof input.hasExplicitViewBox === "boolean" ? input.hasExplicitViewBox : null,
  });
}

function targetGeometry(profile, target = {}) {
  const widthIn = numberOrNull(
    target.placementWidthIn ||
      target.printWidthIn ||
      profile.preferredPrintWidthIn,
  );
  const heightIn = numberOrNull(
    target.placementHeightIn ||
      target.printHeightIn ||
      profile.preferredPrintHeightIn,
  );
  return Object.freeze({ widthIn, heightIn });
}

export function calculateEffectivePpi(assetInput, profileInput, target = {}) {
  const asset = normalizeAsset(assetInput);
  const profile = normalizeManufacturingProfile(profileInput);
  if (
    asset.mediaKind !== "raster" ||
    !asset.contentWidthPx ||
    !asset.contentHeightPx
  ) {
    return Object.freeze({
      effectivePpi: null,
      widthPpi: null,
      heightPpi: null,
      widthIn: null,
      heightIn: null,
      basis: null,
    });
  }

  const { widthIn, heightIn } = targetGeometry(profile, target);
  const widthPpi = widthIn ? asset.contentWidthPx / widthIn : null;
  const heightPpi = heightIn ? asset.contentHeightPx / heightIn : null;
  const samples = [widthPpi, heightPpi].filter((value) => value != null);
  const effectivePpi = samples.length ? Math.min(...samples) : null;
  const basis =
    asset.contentWidthPx !== asset.widthPx ||
    asset.contentHeightPx !== asset.heightPx
      ? "content_bounds"
      : "pixel_bounds";

  return Object.freeze({
    effectivePpi,
    widthPpi,
    heightPpi,
    widthIn,
    heightIn,
    basis,
  });
}

function resolutionQuality(profile, ppi) {
  if (ppi == null || profile.resolution.readyPpi == null) {
    return Object.freeze({
      band: "unknown",
      readyPpi: profile.resolution.readyPpi,
      minimumPpi: profile.resolution.minimumPpi,
    });
  }

  if (ppi >= profile.resolution.readyPpi) {
    return Object.freeze({
      band: "ready",
      readyPpi: profile.resolution.readyPpi,
      minimumPpi: profile.resolution.minimumPpi,
    });
  }

  if (
    profile.resolution.minimumPpi != null &&
    ppi >= profile.resolution.minimumPpi
  ) {
    return Object.freeze({
      band: "warning",
      readyPpi: profile.resolution.readyPpi,
      minimumPpi: profile.resolution.minimumPpi,
    });
  }

  return Object.freeze({
    band: "fail",
    readyPpi: profile.resolution.readyPpi,
    minimumPpi: profile.resolution.minimumPpi,
  });
}

export function evaluateManufacturingCompatibility(
  assetInput,
  profileInput,
  target = {},
) {
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

  const canAutoVectorize =
    asset.mediaKind === "raster" &&
    profile.allowVector &&
    profile.vectorization.enabled;

  if (asset.mediaKind === "raster" && !profile.allowRaster) {
    if (canAutoVectorize) {
      addIssue(
        issues,
        COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
        "raster_requires_vectorization",
        "Build and verify a process-specific vector derivative before production.",
        "vectorize_monochrome",
        {
          preferredTracer: profile.vectorization.preferredTracer,
          outputFormat: profile.vectorization.outputFormat,
        },
      );
    } else {
      addIssue(
        issues,
        COMPATIBILITY_STATUS.NEEDS_VARIANT,
        "raster_not_allowed",
        "This manufacturing profile requires a non-raster production variant.",
        "build_vector_or_process_specific_variant",
      );
    }
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
      (targetKind === "raster" &&
        ["raster", "vector"].includes(asset.mediaKind)) ||
      (targetKind === "vector" &&
        (asset.mediaKind === "vector" || canAutoVectorize));

    addIssue(
      issues,
      conversionAllowed
        ? COMPATIBILITY_STATUS.READY_WITH_TRANSFORM
        : COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "format_mismatch",
      `Production format is ${profile.format}; source is ${asset.format}.`,
      conversionAllowed
        ? canAutoVectorize && targetKind === "vector"
          ? "vectorize_monochrome"
          : `convert:${profile.format}`
        : "build_process_specific_variant",
    );
  }

  if (
    asset.mediaKind === "raster" &&
    asset.transparentBorderDetected &&
    !asset.isAlphaTrimmed
  ) {
    addIssue(
      issues,
      profile.autoNormalize.trimAlpha
        ? COMPATIBILITY_STATUS.READY_WITH_TRANSFORM
        : COMPATIBILITY_STATUS.READY_WITH_WARNING,
      "transparent_border_detected",
      "Transparent outer pixels change the visible-artwork geometry.",
      profile.autoNormalize.trimAlpha ? "trim_alpha" : null,
    );
  }

  if (
    profile.colorSpace &&
    asset.colorSpace &&
    asset.colorSpace !== profile.colorSpace
  ) {
    addIssue(
      issues,
      profile.autoNormalize.colorSpace
        ? COMPATIBILITY_STATUS.READY_WITH_TRANSFORM
        : COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "color_space_mismatch",
      `Convert ${asset.colorSpace} to ${profile.colorSpace}.`,
      profile.autoNormalize.colorSpace
        ? `normalize_color_space:${profile.colorSpace}`
        : "replace_or_convert_color_space",
    );
  }

  if (profile.colorMode === "monochrome" && asset.colorMode !== "monochrome") {
    addIssue(
      issues,
      canAutoVectorize || asset.mediaKind === "vector"
        ? COMPATIBILITY_STATUS.READY_WITH_TRANSFORM
        : COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "monochrome_required",
      "Create a monochrome production derivative.",
      canAutoVectorize ? "vectorize_monochrome" : "convert_monochrome",
    );
  }

  if (!profile.allowGradients && asset.mediaKind === "vector" && asset.hasGradients) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "gradients_not_allowed",
      "Gradients must be simplified for this manufacturing process.",
      "simplify_gradients",
    );
  }

  if (
    profile.requireClosedPaths &&
    asset.mediaKind === "vector" &&
    asset.hasOpenPaths
  ) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "closed_paths_required",
      "Open vector paths must be closed before production.",
      "close_paths",
    );
  }

  if (
    profile.requireViewBox &&
    asset.mediaKind === "vector" &&
    asset.hasExplicitViewBox === false
  ) {
    addIssue(
      issues,
      profile.autoNormalize.svgOptimize
        ? COMPATIBILITY_STATUS.READY_WITH_TRANSFORM
        : COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "viewbox_required",
      "SVG production artwork requires an explicit viewBox.",
      profile.autoNormalize.svgOptimize ? "normalize_svg" : "repair_svg_viewbox",
    );
  }

  if (
    profile.outlineText &&
    asset.mediaKind === "vector" &&
    asset.hasLiveText
  ) {
    addIssue(
      issues,
      profile.autoNormalize.outlineText
        ? COMPATIBILITY_STATUS.READY_WITH_TRANSFORM
        : COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "outline_text_required",
      "Convert live text to vector outlines.",
      profile.autoNormalize.outlineText ? "outline_text" : "outline_text_manually",
    );
  }

  if (
    profile.requireAlpha &&
    asset.mediaKind === "raster" &&
    asset.hasAlpha === false
  ) {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "alpha_required",
      "This production profile requires transparent artwork.",
      "build_transparent_variant",
    );
  }

  const resolution = calculateEffectivePpi(asset, profile, target);
  const quality = resolutionQuality(profile, resolution.effectivePpi);

  if (quality.band === "warning") {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.READY_WITH_WARNING,
      "soft_resolution",
      `Effective resolution is ${Math.round(
        resolution.effectivePpi,
      )} PPI at the current physical placement; target is ${Math.round(
        quality.readyPpi,
      )} PPI.`,
      null,
      {
        effectivePpi: resolution.effectivePpi,
        readyPpi: quality.readyPpi,
        minimumPpi: quality.minimumPpi,
      },
    );
  } else if (quality.band === "fail") {
    addIssue(
      issues,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
      "insufficient_resolution",
      `Effective resolution is ${Math.round(
        resolution.effectivePpi,
      )} PPI at the current physical placement; minimum is ${Math.round(
        quality.minimumPpi || quality.readyPpi,
      )} PPI.`,
      "replace_with_higher_resolution_master",
      {
        effectivePpi: resolution.effectivePpi,
        readyPpi: quality.readyPpi,
        minimumPpi: quality.minimumPpi,
      },
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
    (current, issue) =>
      severity[issue.status] > severity[current] ? issue.status : current,
    COMPATIBILITY_STATUS.READY,
  );

  if (
    ![
      COMPATIBILITY_STATUS.UNSUPPORTED,
      COMPATIBILITY_STATUS.NEEDS_VARIANT,
    ].includes(status) &&
    profile.handoff?.status ===
      COMPATIBILITY_STATUS.PREPARED_FOR_DIGITIZATION
  ) {
    status = COMPATIBILITY_STATUS.PREPARED_FOR_DIGITIZATION;
  }

  const requirementsVerified = profile.source?.verified !== false;
  const nonBlocking =
    status === COMPATIBILITY_STATUS.READY ||
    status === COMPATIBILITY_STATUS.READY_WITH_WARNING;

  return Object.freeze({
    profileId: profile.id,
    manufacturer: profile.manufacturer,
    process: profile.process,
    status,
    requirementsVerified,
    productionReady: nonBlocking && requirementsVerified,
    transformReady: status === COMPATIBILITY_STATUS.READY_WITH_TRANSFORM,
    effectivePpi:
      resolution.effectivePpi == null
        ? null
        : Math.round(resolution.effectivePpi * 10) / 10,
    resolution: Object.freeze({
      band: quality.band,
      basis: resolution.basis,
      widthPpi:
        resolution.widthPpi == null
          ? null
          : Math.round(resolution.widthPpi * 10) / 10,
      heightPpi:
        resolution.heightPpi == null
          ? null
          : Math.round(resolution.heightPpi * 10) / 10,
      readyPpi: quality.readyPpi,
      minimumPpi: quality.minimumPpi,
    }),
    target: Object.freeze({
      format: profile.format,
      ppi: profile.ppi,
      printWidthIn: resolution.widthIn,
      printHeightIn: resolution.heightIn,
    }),
    issues: Object.freeze(issues),
    actions: Object.freeze([
      ...new Set(issues.map((issue) => issue.action).filter(Boolean)),
    ]),
    handoff: profile.handoff,
  });
}

export function evaluateCompatibleProducts(asset, products, registry) {
  return products.map((product) => {
    const profile =
      (product.profileId && registry.get(product.profileId)) ||
      registry.select(product.profileContext || product);
    if (!profile) {
      return Object.freeze({
        ...product,
        compatibility: {
          status: COMPATIBILITY_STATUS.UNSUPPORTED,
          productionReady: false,
          issues: [
            {
              code: "profile_not_found",
              message: "No manufacturing profile matched this product.",
            },
          ],
          actions: [],
        },
      });
    }
    return Object.freeze({
      ...product,
      profileId: profile.id,
      compatibility: evaluateManufacturingCompatibility(
        asset,
        profile,
        product.target || product,
      ),
    });
  });
}
