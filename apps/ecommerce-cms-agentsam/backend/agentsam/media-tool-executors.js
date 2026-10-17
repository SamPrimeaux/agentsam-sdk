/**
 * Merchant-scoped AgentSam media tool adapters.
 * Shares real admin/Media Library executors; no parallel implementation.
 * Callable only after a scoped, enabled agentsam_tools row and write gate.
 */
import { editImageWithPrompt, resampleImage, loadSourceImage, generateMediaArtwork } from "../media/image-operations.js";
import { evaluateManufacturingCompatibility } from "../../packages/agentsam-merch/src/index.js";
import { completefulTarget } from "../../packages/agentsam-merch/src/adapters-completeful.js";
import decodePng from "@jsquash/png/decode.js";
import decodeWebp from "@jsquash/webp/decode.js";
import decodeJpeg from "@jsquash/jpeg/decode.js";

export const MEDIA_EXECUTABLE_TOOL_KEYS = new Set([
  "media_image_background_remove",
  "media_image_optimize",
  "media_image_edit",
  "media_image_generate",
  "media_image_resample",
  "commerce_artwork_preflight",
  "commerce_mockup_render",
]);

function parseJson(raw) {
  if (!raw) return {};
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { return {}; }
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function preflightManufacturingArtwork(env, params = {}) {
  const asset = await loadSourceImage(env, params.media_asset_id);
  const productId = String(params.catalog_product_id || "").trim();
  const locationId = String(params.print_location_id || "").trim();
  if (!productId || !locationId) throw new Error("print_location_and_product_required");
  const product = await env.DB.prepare(
    `SELECT * FROM completeful_catalog_products
     WHERE completeful_product_id = ? OR catalog_product_id = ?
     ORDER BY CASE WHEN completeful_product_id = ? THEN 0 ELSE 1 END LIMIT 1`,
  ).bind(productId, productId, productId).first();
  if (!product) throw new Error("catalog_product_not_found");
  const location = await env.DB.prepare(
    `SELECT * FROM completeful_catalog_print_locations
     WHERE completeful_product_id = ? AND print_location_id = ? AND enabled = 1`,
  ).bind(product.completeful_product_id, locationId).first();
  if (!location) throw new Error("print_location_not_found");

  await (await import("../assets/worker-codecs-wasm.js")).prepareWorkerCodecs();
  const bytes = asset.bytes.buffer.slice(asset.bytes.byteOffset, asset.bytes.byteOffset + asset.bytes.byteLength);
  const decoded = asset.mime === "image/png" ? await decodePng(bytes)
    : asset.mime === "image/webp" ? await decodeWebp(bytes) : await decodeJpeg(bytes);
  const unit = String(location.unit || "").toLowerCase();
  const ratio = unit === "in" || unit === "inch" || unit === "inches" ? 1
    : unit === "cm" ? 1 / 2.54 : unit === "mm" ? 1 / 25.4 : null;
  const widthIn = positive(location.file_width) && ratio ? Number(location.file_width) * ratio : null;
  const heightIn = positive(location.file_height) && ratio ? Number(location.file_height) * ratio : null;
  const scale = Number(params.scale_percent == null ? 100 : params.scale_percent);
  if (!Number.isFinite(scale) || scale < 5 || scale > 150) throw new Error("invalid_print_scale");
  const effectiveWidth = widthIn ? widthIn * scale / 100 : null;
  const effectiveHeight = heightIn ? heightIn * scale / 100 : null;
  const axisPpi = [effectiveWidth ? decoded.width / effectiveWidth : null,
    effectiveHeight ? decoded.height / effectiveHeight : null].filter((value) => value != null);
  const measuredPpi = axisPpi.length ? Math.min(...axisPpi) : null;

  const raw = parseJson(location.raw_json);
  // Do not fabricate a DTG profile from a print location's geometry.
  // A file format and physical units must be explicitly supplied by provider data.
  const requiredFormat = String(raw.required_format || raw.file_format || raw.production_format || "").replace(/^image\//, "").toLowerCase();
  const providerPpi = positive(location.dpi);
  const base = {
    ok: true, media_asset_id: asset.row.id,
    catalog_product_id: product.completeful_product_id,
    print_location_id: locationId,
    image_dimensions: { width: decoded.width, height: decoded.height },
    placement: { width_in: effectiveWidth, height_in: effectiveHeight, scale_percent: scale },
    measured_ppi: measuredPpi,
    provider_required_ppi: providerPpi,
    source_preserved: true,
  };
  if (!requiredFormat || !ratio || !measuredPpi || !providerPpi) {
    return { ...base, verified: false, status: "profile_incomplete",
      missing: [
        ...(!requiredFormat ? ["provider_required_format"] : []),
        ...(!ratio ? ["provider_physical_unit"] : []),
        ...(!measuredPpi ? ["physical_print_dimensions"] : []),
        ...(!providerPpi ? ["provider_required_ppi"] : []),
      ],
      message: "Manufacturing readiness cannot be certified from incomplete supplier metadata.",
    };
  }
  const result = evaluateManufacturingCompatibility({
    format: asset.mime.split("/")[1] === "jpeg" ? "jpg" : asset.mime.split("/")[1],
    widthPx: decoded.width, heightPx: decoded.height, bytes: asset.bytes.length,
    hasAlpha: decoded.data?.some?.((_, index) => index % 4 === 3 && decoded.data[index] < 255) || false,
  }, {
    id: `completeful:${product.completeful_product_id}:${locationId}`,
    manufacturer: "completeful", process: String(product.print_type || "unverified"),
    format: requiredFormat, ppi: providerPpi,
    preferredPrintWidthIn: effectiveWidth, preferredPrintHeightIn: effectiveHeight,
    requireAlpha: raw.require_alpha === true,
  }, { ...completefulTarget({ file_width: effectiveWidth, file_height: effectiveHeight }),
    printWidthIn: effectiveWidth, printHeightIn: effectiveHeight });
  return { ...base, verified: true, status: result.status, compatibility: result };
}

export async function executeMediaTool(env, tool, params = {}, options = {}) {
  const actorId = options.user?.id || options.actor_id;
  if (!actorId) return { ok: false, error: "actor_required" };
  try {
    switch (tool.tool_key) {
      case "media_image_background_remove": {
        const { removeMediaBackground } = await import("../admin/media-background.js");
        const result = await removeMediaBackground(new Request("https://local/media/background", { method: "POST" }),
          env, params.media_asset_id, { id: actorId });
        return await result.json();
      }
      case "media_image_optimize": {
        const { batchMedia } = await import("../admin/media.js");
        const result = await batchMedia(new Request("https://local/media/batch", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "optimize", ids: [params.media_asset_id] }),
        }), env);
        return await result.json();
      }
      case "media_image_generate":
        return await generateMediaArtwork(env, {
          prompt: params.prompt, model_id: params.model_id,
          image_options: {
            background: params.background, size: params.size,
            quality: params.quality, format: params.format, variations: 1,
          },
          actor_id: actorId,
        });
      case "media_image_edit":
        return await editImageWithPrompt(env, {
          media_asset_id: params.media_asset_id,
          prompt: params.prompt, model_id: params.model_id, actor_id: actorId,
        });
      case "media_image_resample":
        return await resampleImage(env, {
          media_asset_id: params.media_asset_id, scale: params.scale, actor_id: actorId,
        });
      case "commerce_artwork_preflight":
        return await preflightManufacturingArtwork(env, params);
      case "commerce_mockup_render": {
        const { renderCompletefulMockupMatrix } = await import("../completeful/mockup-renderer.js");
        return await renderCompletefulMockupMatrix(env, params);
      }
      default: return { ok: false, error: "media_handler_not_implemented" };
    }
  } catch (error) {
    return { ok: false, error: String(error?.message || "media_operation_failed").slice(0, 160) };
  }
}
