/**
 * Deterministic media-kind + retention classification.
 * Intake is transient; masters retained only when production requires it.
 */

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"]);
const ICON_HINT = /\b(logos?|icons?|mark|badge|favicon|wordmark)\b/i;
const PRODUCT_HINT = /\b(product|tee|shirt|hat|tumbler|mockup|flatlay)\b/i;
const LIFESTYLE_HINT = /\b(lifestyle|garage|road|scene|hero|editorial)\b/i;
const PRINT_HINT = /\b(print|artwork|artboard|production|completeful|press)\b/i;

export function extensionOf(keyOrName) {
  const name = String(keyOrName || "").split("/").pop() || "";
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

export function guessMimeFromKey(key) {
  const ext = extensionOf(key);
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/mp4",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    usdz: "model/vnd.usdz+zip",
  };
  return map[ext] || "application/octet-stream";
}

/**
 * @param {{
 *   r2Key: string,
 *   contentType?: string|null,
 *   bytes?: number|null,
 *   width?: number|null,
 *   height?: number|null,
 *   hasAlpha?: boolean|null,
 *   filename?: string|null,
 *   folder?: string|null,
 *   production?: { requiresMaster?: boolean, printReady?: boolean }|null,
 *   completeful?: { requiresProductionMaster?: boolean, printReady?: boolean }|null,
 * }} input
 */
export function classifyMediaAsset(input) {
  const key = String(input.r2Key || "").replace(/^\/+/, "");
  const filename = input.filename || key.split("/").pop() || "";
  const ext = extensionOf(filename || key);
  const mime = String(input.contentType || guessMimeFromKey(key)).toLowerCase();
  const bytes = Number(input.bytes || 0);
  const width = Number(input.width || 0);
  const height = Number(input.height || 0);
  const hay = `${key} ${filename} ${input.folder || ""}`;

  /** @type {string} */
  let mediaKind = "unsupported";
  if (ext === "glb" || ext === "gltf" || mime.includes("model/gltf") || mime.includes("glb")) {
    mediaKind = "glb";
  } else if (ext === "usdz" || mime.includes("usdz")) {
    mediaKind = "glb";
  } else if (mime.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(ext)) {
    mediaKind = "video";
  } else if (ext === "svg" || mime === "image/svg+xml") {
    mediaKind = "icon";
  } else if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) {
    mediaKind = ICON_HINT.test(hay) ? "icon" : "image";
  }

  /** @type {string} */
  let mediaRole = "other";
  if (mediaKind === "glb") mediaRole = "glb";
  else if (mediaKind === "video") mediaRole = "video";
  else if (mediaKind === "icon" || ICON_HINT.test(hay)) {
    mediaRole = mime.includes("svg") || /\blogos?\b/i.test(hay) ? "logo" : "icon";
  }
  else if (PRODUCT_HINT.test(hay) || String(input.folder || "") === "products") mediaRole = "product_photo";
  else if (LIFESTYLE_HINT.test(hay)) mediaRole = "lifestyle_photo";
  else if (mediaKind === "image") mediaRole = "product_photo";

  const productStudioProductionMaster =
    /^studio\/(?:prepared|originals)\//i.test(key) ||
    /^products\/completeful\/print\//i.test(key);
  const productStudioMockupInput = /^studio\/mockup-inputs\//i.test(key);

  const productionMaster =
    !!input.production?.requiresMaster ||
    !!input.production?.printReady ||
    // Deprecated provider-specific compatibility shim.
    !!input.completeful?.requiresProductionMaster ||
    !!input.completeful?.printReady ||
    PRINT_HINT.test(hay) ||
    productStudioProductionMaster;

  const alphaLikely =
    input.hasAlpha === true ||
    ext === "png" ||
    ext === "svg" ||
    mime === "image/png" ||
    mime === "image/svg+xml";

  /** @type {'intake'|'canonical'|'master'|'preview'|'unsupported'} */
  let assetRole = "intake";
  /** @type {string|null} */
  let retainMasterReason = null;
  /** @type {string} */
  let pipeline = "no_transform";
  /** @type {string} */
  let outputFormat = mime;
  /** @type {boolean} */
  let promoteDeletesIntake = false;

  if (mediaKind === "unsupported") {
    assetRole = "unsupported";
    pipeline = "no_transform";
  } else if (mediaKind === "glb") {
    assetRole = "master";
    retainMasterReason = "GLB/source model required for 3D preview and downstream editing";
    pipeline = "glb";
  } else if (mediaKind === "video") {
    assetRole = "master";
    retainMasterReason = "Video mezzanine retained; delivery pipeline plans separately";
    pipeline = "video";
  } else if (ext === "svg" || mediaRole === "logo" && mime === "image/svg+xml") {
    assetRole = "master";
    retainMasterReason = "Vector logo/artwork retains editable authority";
    pipeline = "icon";
    outputFormat = "image/svg+xml";
  } else if (productStudioMockupInput) {
    // Mockup renderer inputs are deterministic preview exports of the same
    // canonical artwork recipe. They must not be promoted/re-encoded by the
    // generic storefront optimizer.
    assetRole = "preview";
    retainMasterReason = "Product Studio mockup-render input";
    pipeline = "no_transform";
    outputFormat = mime;
  } else if (productionMaster || (mediaRole === "logo" && alphaLikely && bytes > 0 && bytes < 2_000_000 && (ext === "png" || mime === "image/png"))) {
    // Transparent production/print or brand marks that must stay PNG for fulfillment.
    assetRole = "master";
    retainMasterReason = productStudioProductionMaster
      ? "Product Studio production artwork must remain print-safe"
      : productionMaster
        ? "Production/print requirements"
        : "Transparent brand mark retained as production-capable PNG";
    pipeline = productStudioProductionMaster ? "no_transform" : mediaKind === "icon" ? "icon" : "image";
    outputFormat = mime;
  } else if (mediaKind === "icon") {
    assetRole = "canonical";
    pipeline = "icon";
    outputFormat = alphaLikely ? "image/webp" : "image/webp";
    promoteDeletesIntake = true;
  } else if (mediaKind === "image") {
    assetRole = "canonical";
    pipeline = "image";
    outputFormat = "image/webp";
    promoteDeletesIntake = true;
  }

  const oversized = bytes >= 500_000 || width >= 2400 || height >= 2400;
  const needsOptimize =
    pipeline !== "no_transform" &&
    mediaKind === "image" &&
    assetRole === "canonical" &&
    (oversized || !mime.includes("webp"));

  return {
    media_kind: mediaKind,
    media_role: mediaRole,
    asset_role: assetRole,
    pipeline,
    output_format: outputFormat,
    alpha_required: alphaLikely && (mediaRole === "logo" || mediaRole === "icon"),
    retain_master_reason: retainMasterReason,
    promote_deletes_intake: promoteDeletesIntake,
    needs_optimize: needsOptimize || (assetRole === "canonical" && mediaKind === "image"),
    transform_state:
      mediaKind === "unsupported"
        ? "unsupported"
        : (assetRole === "master" && (pipeline === "no_transform" || mediaKind === "glb" || mediaKind === "video" || ext === "svg")) ||
            assetRole === "preview"
          ? "no_transform"
          : "planned",
  };
}

/**
 * Build canonical destination key for a promoted asset (no permanent staging museum).
 * @param {{ intakeKey: string, folder?: string|null, mediaRole?: string, outputExt: string }} input
 */
export function canonicalKeyForPromotion(input) {
  const intakeKey = String(input.intakeKey || "").replace(/^\/+/, "");
  const base = String(intakeKey.split("/").pop() || "asset");
  const stem = base.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "asset";
  const ext = String(input.outputExt || "webp").replace(/^\./, "");
  const folder = input.folder || (intakeKey.startsWith("products/") ? "products" : "images");

  if (intakeKey.startsWith("products/")) {
    const parts = intakeKey.split("/");
    const collection = parts[1] || "general";
    return `products/${collection}/${stem}.${ext}`;
  }
  if (folder === "products") return `products/general/${stem}.${ext}`;
  if (folder === "videos") return `videos/${stem}.${ext}`;
  if (input.mediaRole === "logo" || input.mediaRole === "icon") {
    return `brand/${input.mediaRole === "logo" ? "logos" : "icons"}/${stem}.${ext}`;
  }
  // Prefer replacing under images/ rather than leaving forever under intake/
  if (intakeKey.startsWith("intake/") || intakeKey.startsWith("uploads/")) {
    return `images/${stem}.${ext}`;
  }
  // Same directory promote (extension may change)
  const dir = intakeKey.includes("/") ? intakeKey.slice(0, intakeKey.lastIndexOf("/")) : "images";
  return `${dir}/${stem}.${ext}`;
}

/**
 * Route to the correct named pipeline workflow key.
 * @param {ReturnType<typeof classifyMediaAsset>} classification
 */
export function routePipelineWorkflow(classification) {
  switch (classification.pipeline) {
    case "image":
      return "fnf_image_pipeline";
    case "icon":
      return "fnf_icon_pipeline";
    case "video":
      return "fnf_video_pipeline";
    case "glb":
      return "fnf_glb_pipeline";
    default:
      return null;
  }
}
