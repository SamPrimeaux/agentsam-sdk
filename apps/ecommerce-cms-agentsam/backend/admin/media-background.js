/** Authenticated admin-domain media transform; original R2 object is immutable.
 * Cloudflare Images is an OPTIONAL subject segmentation provider. @jsquash and
 * Node/Sharp remain independent optimization runtimes.
 */
import { mediaPathForKey, publicUrlsForKey } from "../assets/product-optimize.js";

const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
function json(value, status = 200) { return Response.json(value, { status }); }

export async function removeMediaBackground(request, env, id, actor) {
  if (!actor?.id) return json({ error: "Authenticated media editor required" }, 401);
  if (!env.IMAGES?.input) return json({ error: "Subject segmentation is not configured for this installation", code: "segmentation_unavailable" }, 503);
  const assetId = Number(id);
  if (!Number.isSafeInteger(assetId) || assetId <= 0) return json({ error: "Invalid media asset ID" }, 400);
  const row = await env.DB.prepare("SELECT * FROM media_assets WHERE id = ?").bind(assetId).first();
  if (!row) return json({ error: "Media asset not found" }, 404);
  const mime = String(row.content_type || "").toLowerCase().split(";")[0];
  if (!TYPES.has(mime)) return json({ error: "Background removal supports PNG, JPEG or WebP images" }, 415);
  if (!row.r2_key || String(row.r2_key).startsWith("/")) return json({ error: "Original media object unavailable" }, 422);
  const original = await env.WEBSITE_ASSETS.get(row.r2_key);
  if (!original) return json({ error: "Original media object missing" }, 404);
  if (original.size > MAX_INPUT_BYTES) return json({ error: "Source exceeds the subject segmentation input limit" }, 413);

  const input = await original.arrayBuffer();
  if (!input.byteLength || input.byteLength > MAX_INPUT_BYTES) return json({ error: "Unsupported input size" }, 413);
  let outputBytes;
  try {
    const result = await env.IMAGES.input(new Blob([input], { type: mime }).stream())
      .transform({ segment: "foreground" })
      .output({ format: "image/png" });
    outputBytes = await result.response().arrayBuffer();
  } catch (error) {
    return json({ code: "segmentation_failed", error: error?.message || "Background removal failed. Original was not changed." }, 502);
  }
  if (!outputBytes?.byteLength || outputBytes.byteLength > MAX_OUTPUT_BYTES) {
    return json({ error: "Provider returned an unusable image" }, 502);
  }
  const bytes = new Uint8Array(outputBytes);
  const pngSignature = [137,80,78,71,13,10,26,10];
  if (!pngSignature.every((value,index)=>bytes[index] === value) || bytes.byteLength < 33) {
    return json({ error: "Segmentation provider returned an invalid PNG" }, 502);
  }
  const view = new DataView(outputBytes);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const colorType = bytes[25];
  if (!width || !height || width > 8192 || height > 8192 || width * height > 20_000_000 || ![4,6].includes(colorType)) {
    return json({ error: "Segmentation result lacks valid alpha-capable pixels or dimensions" }, 502);
  }
  const derivativeKey = `derivatives/background-remove/${assetId}/${crypto.randomUUID()}.png`;
  const meta = {
    media_edit: {
      method: "cf_images_foreground",
      source_media_asset_id: assetId,
      source_r2_key: row.r2_key,
      operation: "media.image.background.remove",
      actor_id: actor.id,
      created_at: new Date().toISOString(),
      output_width: width, output_height: height,
    },
    lifecycle: "ready",
  };
  await env.WEBSITE_ASSETS.put(derivativeKey, outputBytes, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { "agentsam-original-key": String(row.r2_key).slice(0,200), "agentsam-operation": "background-remove" },
  });
  try {
    const result = await env.DB.prepare(
      `INSERT INTO media_assets
       (r2_key, url, filename, content_type, size_bytes, category, folder, display_order, meta_json, updated_at)
       VALUES (?, ?, ?, 'image/png', ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(derivativeKey, mediaPathForKey(derivativeKey),
      String(row.filename || "artwork").replace(/\.[^.]+$/,"").slice(0,80) + "-cutout.png",
      outputBytes.byteLength, row.category ?? null, row.folder || "images", row.display_order || 0, JSON.stringify(meta)).run();
    const idValue = result.meta?.last_row_id;
    const saved = idValue ? await env.DB.prepare("SELECT * FROM media_assets WHERE id = ?").bind(idValue).first() :
      await env.DB.prepare("SELECT * FROM media_assets WHERE r2_key = ?").bind(derivativeKey).first();
    return json({ ok: true, source_media_asset_id: assetId,
      asset: { id: saved?.id, r2_key: derivativeKey, url: publicUrlsForKey(derivativeKey).worker,
        filename: saved?.filename || "cutout.png", content_type: "image/png", size_bytes: outputBytes.byteLength, folder: saved?.folder || "images", meta },
      width, height, source_preserved: true, provider: "cf_images" }, 201);
  } catch (error) {
    // Clean up the orphan new derivative only. Never delete or overwrite source.
    await env.WEBSITE_ASSETS.delete(derivativeKey).catch(() => null);
    return json({ error: "Could not register the derivative; original remains unchanged", code: "derivative_persist_failed" }, 500);
  }
}
