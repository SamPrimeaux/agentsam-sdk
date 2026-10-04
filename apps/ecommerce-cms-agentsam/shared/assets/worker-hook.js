/**
 * Worker-safe ingest plan: classify → route pipeline → canonical URL intent.
 * Heavy sharp promote runs via bin/commerce-assets; Worker never pretends optimize finished.
 */

import { ASSET_STORAGE, publicUrlsForKey, deliveryUrlForKey } from "./config.js";
import {
  classifyMediaAsset,
  routePipelineWorkflow,
  guessMimeFromKey,
  extensionOf,
  canonicalKeyForPromotion,
} from "./classify.js";
import { buildDeterministicSuggestions } from "./suggestions.js";
import { buildAssetTags, inferProductContextFromKey } from "./tags.js";

export { canonicalKeyForPromotion };

function outputExtFor(classification) {
  const fmt = classification.output_format || "";
  if (fmt.includes("svg")) return "svg";
  if (fmt.includes("webp")) return "webp";
  if (fmt.includes("png")) return "png";
  if (fmt.includes("jpeg") || fmt.includes("jpg")) return "jpg";
  if (fmt.includes("mp4")) return "mp4";
  if (fmt.includes("gltf-binary") || classification.media_kind === "glb") return "glb";
  return extensionOf(classification.output_format) || "bin";
}

/**
 * Plan ingest for an uploaded/intake object. Safe in Workers (no sharp).
 */
export function planAssetIngest(input) {
  const key = String(input.r2Key || "").replace(/^\/+/, "");
  const filename = input.filename || key.split("/").pop() || "upload";
  const contentType = input.contentType || guessMimeFromKey(key);
  const classification = classifyMediaAsset({
    r2Key: key,
    filename,
    contentType,
    bytes: input.bytes,
    width: input.width,
    height: input.height,
    folder: input.folder,
    completeful: input.completeful,
  });

  const workflowKey = routePipelineWorkflow(classification);
  const inferred = inferProductContextFromKey(key);
  const productSlug = input.productSlug || inferred.productSlug;
  const collection = input.collection || inferred.collection;
  const outExt = outputExtFor(classification);

  const willPromote =
    classification.asset_role === "canonical" && classification.promote_deletes_intake;

  const canonicalKey = willPromote
    ? canonicalKeyForPromotion({
        intakeKey: key,
        folder: input.folder,
        mediaRole: classification.media_role,
        outputExt: outExt,
      })
    : key;

  const intelligence = buildDeterministicSuggestions({
    r2Key: key,
    filename,
    contentType,
    bytes: input.bytes,
    width: input.width,
    height: input.height,
    folder: input.folder,
    brandName: input.brandName,
    existing: {
      alt_text: input.alt || input.existingMeta?.alt_text,
      title: input.existingMeta?.title,
      tags: input.existingMeta?.tags,
    },
  });

  const tags = buildAssetTags({
    r2Key: key,
    productSlug,
    collection,
    assetKind:
      classification.media_kind === "icon"
        ? "icon"
        : classification.media_kind === "glb"
          ? "glb"
          : classification.media_kind === "video"
            ? "video"
            : input.folder === "products"
              ? "product"
              : "image",
    alt: input.alt,
    source: "admin_content_ingest",
  });

  const transformState =
    classification.media_kind === "unsupported"
      ? "unsupported"
      : willPromote
        ? "planned"
        : classification.transform_state === "no_transform"
          ? "no_transform"
          : "planned";

  return {
    ok: true,
    workflow_key: workflowKey,
    source_key: key,
    intake_key: key,
    canonical_key: canonicalKey,
    source_bytes: input.bytes ?? null,
    content_type: contentType,
    classification,
    transform_state: transformState,
    optimized: false,
    execution: willPromote
      ? {
          mode: "cli_or_node",
          command: `bin/commerce-assets promote --key ${key}`,
          note: "Promote optimized result to canonical key, then delete intake.",
        }
      : {
          mode: "none",
          note:
            transformState === "unsupported"
              ? "Unsupported media preserved as-is; no transform claimed."
              : "Master/no_transform asset — original retained as authority.",
        },
    urls: {
      intake: publicUrlsForKey(key),
      canonical: publicUrlsForKey(canonicalKey),
      delivery: deliveryUrlForKey(canonicalKey),
    },
    tags,
    intelligence,
    meta: {
      asset_role: classification.asset_role,
      media_kind: classification.media_kind,
      media_role: classification.media_role,
      pipeline: classification.pipeline,
      transform_state: transformState,
      intake_key: key,
      canonical_key: canonicalKey,
      retain_master_reason: classification.retain_master_reason,
      promote_deletes_intake: classification.promote_deletes_intake,
      public_base_url: ASSET_STORAGE.publicBaseUrl,
      worker_media_base_url: ASSET_STORAGE.workerMediaBaseUrl,
      optimization: {
        status: transformState,
        planned_at: new Date().toISOString(),
        output_format: classification.output_format,
      },
    },
  };
}

/** @deprecated Use planAssetIngest — kept for Completeful callers. */
export function planProductAssetOptimization(input) {
  const plan = planAssetIngest({
    r2Key: input.r2Key,
    bytes: input.bytes,
    filename: input.r2Key?.split("/").pop(),
    folder: "products",
    alt: input.alt,
    productSlug: input.productSlug,
    collection: input.collection,
    completeful: input.completeful || null,
  });
  return {
    ...plan,
    staging: {
      optimized_webp_key: plan.canonical_key,
      optimized_jpeg_key: null,
      preview_key: null,
    },
    execute_cli: plan.execution?.command || null,
    requires_approval_to_replace_live: false,
    retention_policy: "intake_promote_delete",
  };
}
