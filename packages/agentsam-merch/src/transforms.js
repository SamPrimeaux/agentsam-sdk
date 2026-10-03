import {
  COMPATIBILITY_STATUS,
  evaluateManufacturingCompatibility,
} from "./compatibility.js";
import { normalizeManufacturingProfile } from "./profile.js";

export const TRANSFORM_OPERATION = Object.freeze({
  TRIM_ALPHA: "trim_alpha",
  NORMALIZE_COLOR_SPACE: "normalize_color_space",
  NORMALIZE_SVG: "normalize_svg",
  OUTLINE_TEXT: "outline_text",
  VECTORIZER: "vectorize_monochrome",
  RASTERIZE: "rasterize",
  LOSSLESS_OPTIMIZE: "lossless_optimize",
  CONVERT_FORMAT: "convert_format",
  CONVERT_MONOCHROME: "convert_monochrome",
});

function operationFromAction(action, issue, profile) {
  if (!action) return null;
  if (action === "trim_alpha") {
    return {
      id: TRANSFORM_OPERATION.TRIM_ALPHA,
      automatic: true,
      requires: ["raster_normalizer"],
      params: {},
    };
  }
  if (action.startsWith("normalize_color_space:")) {
    return {
      id: TRANSFORM_OPERATION.NORMALIZE_COLOR_SPACE,
      automatic: true,
      requires: ["raster_normalizer"],
      params: { colorSpace: action.split(":")[1] || profile.colorSpace || "srgb" },
    };
  }
  if (action === "normalize_svg") {
    return {
      id: TRANSFORM_OPERATION.NORMALIZE_SVG,
      automatic: true,
      requires: ["svg_normalizer"],
      params: { requireViewBox: true },
    };
  }
  if (action === "outline_text") {
    return {
      id: TRANSFORM_OPERATION.OUTLINE_TEXT,
      automatic: true,
      requires: ["text_outliner"],
      params: {},
      note:
        "SVGO does not convert fonts to paths by itself; outlining requires a font-aware vector executor.",
    };
  }
  if (action === "vectorize_monochrome") {
    return {
      id: TRANSFORM_OPERATION.VECTORIZER,
      automatic: true,
      requires: ["vector_tracer", "raster_normalizer"],
      params: {
        tracer: issue?.meta?.preferredTracer || profile.vectorization.preferredTracer || "auto",
        outputFormat: profile.vectorization.outputFormat || "svg",
        maxAspectDrift: profile.vectorization.maxAspectDrift,
        minBoundaryIntegrity: profile.vectorization.minBoundaryIntegrity,
      },
    };
  }
  if (action.startsWith("rasterize:")) {
    return {
      id: TRANSFORM_OPERATION.RASTERIZE,
      automatic: true,
      requires: ["vector_rasterizer"],
      params: { format: action.split(":")[1] || profile.format },
    };
  }
  if (action === "lossless_optimize") {
    return {
      id: TRANSFORM_OPERATION.LOSSLESS_OPTIMIZE,
      automatic: true,
      requires: ["raster_normalizer"],
      params: { format: profile.format },
    };
  }
  if (action.startsWith("convert:")) {
    return {
      id: TRANSFORM_OPERATION.CONVERT_FORMAT,
      automatic: true,
      requires: ["format_converter"],
      params: { format: action.split(":")[1] || profile.format },
    };
  }
  if (action === "convert_monochrome") {
    return {
      id: TRANSFORM_OPERATION.CONVERT_MONOCHROME,
      automatic: true,
      requires: ["vector_normalizer"],
      params: {},
    };
  }
  return {
    id: action,
    automatic: false,
    requires: [],
    params: {},
  };
}

export function planAutomaticTransforms({
  asset,
  profile: profileInput,
  target = {},
  capabilities = {},
} = {}) {
  const profile = normalizeManufacturingProfile(profileInput);
  const compatibility = evaluateManufacturingCompatibility(asset, profile, target);
  const operations = [];
  const seen = new Set();

  for (const issue of compatibility.issues) {
    const operation = operationFromAction(issue.action, issue, profile);
    if (!operation || seen.has(operation.id)) continue;
    seen.add(operation.id);
    const missingCapabilities = operation.requires.filter(
      (capability) => capabilities[capability] !== true,
    );
    operations.push(
      Object.freeze({
        ...operation,
        issueCode: issue.code,
        missingCapabilities: Object.freeze(missingCapabilities),
        executable:
          operation.automatic === true && missingCapabilities.length === 0,
      }),
    );
  }

  const blockingIssue = compatibility.issues.find(
    (issue) =>
      issue.status === COMPATIBILITY_STATUS.NEEDS_VARIANT ||
      issue.status === COMPATIBILITY_STATUS.UNSUPPORTED,
  );
  const allRequiredExecutable = operations
    .filter((operation) => operation.automatic)
    .every((operation) => operation.executable);

  return Object.freeze({
    compatibility,
    operations: Object.freeze(operations),
    canExecuteAutomatically:
      !blockingIssue && operations.length > 0 && allRequiredExecutable,
    hasBlockingIssue: Boolean(blockingIssue),
  });
}

function ratio(width, height) {
  const w = Number(width);
  const h = Number(height);
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
    ? w / h
    : null;
}

export function verifyVectorizationResult({
  source,
  result,
  profile: profileInput,
} = {}) {
  const profile = normalizeManufacturingProfile(profileInput);
  const sourceRatio = ratio(
    source?.contentWidthPx || source?.widthPx || source?.width,
    source?.contentHeightPx || source?.heightPx || source?.height,
  );
  const resultRatio = ratio(
    result?.contentWidthPx || result?.widthPx || result?.width,
    result?.contentHeightPx || result?.heightPx || result?.height,
  );

  const aspectDrift =
    sourceRatio && resultRatio
      ? Math.abs(resultRatio - sourceRatio) / Math.abs(sourceRatio)
      : null;
  const boundaryIntegrity =
    Number.isFinite(Number(result?.boundaryIntegrity))
      ? Math.max(0, Math.min(1, Number(result.boundaryIntegrity)))
      : null;

  const aspectOk =
    aspectDrift != null &&
    aspectDrift <= profile.vectorization.maxAspectDrift;
  const boundaryOk =
    boundaryIntegrity != null &&
    boundaryIntegrity >= profile.vectorization.minBoundaryIntegrity;

  return Object.freeze({
    verified: aspectOk && boundaryOk,
    aspectOk,
    boundaryOk,
    aspectDrift,
    boundaryIntegrity,
    thresholds: Object.freeze({
      maxAspectDrift: profile.vectorization.maxAspectDrift,
      minBoundaryIntegrity: profile.vectorization.minBoundaryIntegrity,
    }),
    reason:
      aspectDrift == null
        ? "aspect_ratio_unavailable"
        : !aspectOk
          ? "aspect_ratio_drift"
          : boundaryIntegrity == null
            ? "boundary_integrity_unavailable"
            : !boundaryOk
              ? "boundary_integrity_below_threshold"
              : null,
  });
}
