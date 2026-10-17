/**
 * Non-destructive image revisions for an authorized Media Library asset.
 * Original R2 objects are never overwritten. The caller must already have an
 * authenticated merchant session or the AgentSam tool authorization gate.
 */
import decodePng from "@jsquash/png/decode.js";
import decodeJpeg from "@jsquash/jpeg/decode.js";
import decodeWebp from "@jsquash/webp/decode.js";
import encodePng from "@jsquash/png/encode.js";
import resize from "@jsquash/resize";
import { mediaPathForKey } from "../assets/config.js";

const SOURCES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_SOURCE = 10 * 1024 * 1024;
const MAX_DERIVATIVE = 20 * 1024 * 1024;

export async function loadSourceImage(env, mediaAssetId) {
  const id = Number(mediaAssetId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("invalid_media_asset_id");
  const row = await env.DB.prepare("SELECT * FROM media_assets WHERE id = ?").bind(id).first();
  if (!row) throw new Error("media_asset_not_found");
  const mime = String(row.content_type || "").toLowerCase().split(";")[0];
  if (!SOURCES.has(mime) || !row.r2_key || String(row.r2_key).startsWith("/")) {
    throw new Error("unsupported_source_image");
  }
  if (!env.WEBSITE_ASSETS?.get) throw new Error("media_storage_unavailable");
  const object = await env.WEBSITE_ASSETS.get(row.r2_key);
  if (!object) throw new Error("media_source_object_not_found");
  if (object.size > MAX_SOURCE) throw new Error("source_exceeds_image_limit");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_SOURCE) throw new Error("source_exceeds_image_limit");
  return { row, bytes, mime };
}

function pngInfo(bytes) {
  const sig = [137,80,78,71,13,10,26,10];
  if (bytes.length < 33 || !sig.every((n,i) => bytes[i] === n)) throw new Error("provider_returned_invalid_png");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 20_000_000) {
    throw new Error("image_dimensions_out_of_bounds");
  }
  return { width, height, mime: "image/png" };
}

export async function saveImageDerivative(env, source, bytes, { kind, actorId, modelId = null, instructions = null, metadata = {} }) {
  if (!(bytes instanceof Uint8Array)) throw new Error("invalid_derivative_bytes");
  if (bytes.length > MAX_DERIVATIVE) throw new Error("derivative_exceeds_limit");
  const info = pngInfo(bytes);
  const sourceId = Number(source.id);
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) throw new Error("invalid_media_source");
  const key = `derivatives/${kind}/${sourceId}/${crypto.randomUUID()}.png`;
  const stem = String(source.filename || "artwork").replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 75);
  const meta = {
    lifecycle: "ready",
    media_edit: {
      source_media_asset_id: sourceId, source_r2_key: source.r2_key, operation: kind,
      actor_id: actorId, model_id: modelId, instructions,
      created_at: new Date().toISOString(), output_width: info.width, output_height: info.height,
      ...metadata,
    },
  };
  await env.WEBSITE_ASSETS.put(key, bytes, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { "agentsam-source-id": String(sourceId), "agentsam-operation": kind },
  });
  try {
    const result = await env.DB.prepare(
      `INSERT INTO media_assets
      (r2_key,url,filename,content_type,size_bytes,category,folder,display_order,meta_json,updated_at)
      VALUES (?,?,?,'image/png',?,?,?,?,?,datetime('now'))`,
    ).bind(key, mediaPathForKey(key), `${stem}-${kind}.png`,
      bytes.length, source.category || null, source.folder || "images",
      Number(source.display_order || 0), JSON.stringify(meta)).run();
    const row = await env.DB.prepare("SELECT * FROM media_assets WHERE id = ?")
      .bind(result.meta.last_row_id).first();
    return { id: row.id, url: row.url, filename: row.filename, content_type: "image/png",
      size_bytes: bytes.length, r2_key: key, folder: row.folder, meta };
  } catch {
    await env.WEBSITE_ASSETS.delete(key).catch(() => null);
    throw new Error("derivative_registration_failed");
  }
}

function imageEditModelId(value) {
  const id = String(value || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,120}$/.test(id)) throw new Error("image_edit_model_required");
  return id;
}

export async function listEditableImageModels(env) {
  if (!env.DB?.prepare || !env.OPENAI_API_KEY) return [];
  const { results } = await env.DB.prepare(
    `SELECT c.api_model_id AS id, c.display_name AS name
    FROM agentsam_model_catalog c
    JOIN agentsam_model_policies p ON p.model_key = c.model_key
    WHERE c.provider = 'openai' AND c.is_active = 1 AND c.show_in_picker = 1
      AND p.is_active = 1 AND p.routing_eligible = 1
      AND (c.model_kind LIKE 'image%' OR c.api_model_id LIKE 'gpt-image-%' OR c.api_model_id = 'chatgpt-image-latest')
    ORDER BY c.display_name`,
  ).all();
  return results || [];
}

export async function editImageWithPrompt(env, { media_asset_id, prompt, model_id, actor_id }) {
  const text = String(prompt || "").trim();
  if (!text || text.length > 1000) throw new Error("image_edit_prompt_required");
  if (!actor_id) throw new Error("actor_required");
  const modelId = imageEditModelId(model_id);
  const available = await listEditableImageModels(env);
  if (!available.some((m) => m.id === modelId)) throw new Error("image_edit_model_not_registered");
  const source = await loadSourceImage(env, media_asset_id);
  const form = new FormData();
  form.append("model", modelId);
  form.append("prompt", text);
  form.append("image", new Blob([source.bytes], { type: source.mime }), source.row.filename || "image.png");
  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST", headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form, signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error("openai_image_edit_http_" + response.status);
  const data = await response.json();
  const raw = String(data?.data?.[0]?.b64_json || "");
  if (!raw || raw.length > MAX_DERIVATIVE * 2 || !/^[a-z0-9+/]+={0,2}$/i.test(raw)) {
    throw new Error("image_edit_provider_payload_invalid");
  }
  const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
  const asset = await saveImageDerivative(env, source.row, bytes, {
    kind: "ai-edit", actorId: actor_id, modelId, instructions: text,
  });
  return { ok: true, asset, source_media_asset_id: source.row.id, source_preserved: true };
}

/**
 * Pixel resampling is NOT generative upscaling. We save a correctly labelled
 * derivative and never claim to have recovered missing source detail/PPI.
 */
export async function resampleImage(env, { media_asset_id, scale, actor_id }) {
  if (![2,4].includes(scale)) throw new Error("invalid_resample_scale");
  if (!actor_id) throw new Error("actor_required");
  const source = await loadSourceImage(env, media_asset_id);
  await (await import("../assets/worker-codecs-wasm.js")).prepareWorkerCodecs();
  const buffer = source.bytes.buffer.slice(source.bytes.byteOffset, source.bytes.byteOffset + source.bytes.byteLength);
  const decoded = source.mime === "image/png" ? await decodePng(buffer)
    : source.mime === "image/webp" ? await decodeWebp(buffer) : await decodeJpeg(buffer);
  const width = decoded.width * scale, height = decoded.height * scale;
  if (width > 8192 || height > 8192 || width * height > 20_000_000) throw new Error("resample_dimensions_exceed_limit");
  const result = await resize(decoded, { width, height, method: "lanczos3" });
  const bytes = new Uint8Array(await encodePng(result));
  const asset = await saveImageDerivative(env, source.row, bytes, {
    kind: "resample", actorId: actor_id, metadata: {
      resample_scale: scale, source_width: decoded.width, source_height: decoded.height,
      quality_claim: "resampled_pixels_only_no_new_detail",
    },
  });
  return { ok: true, asset, source_media_asset_id: source.row.id,
    source_preserved: true, print_readiness_unchanged: true };
}

/** Create a library candidate from a policy-eligible image model, without placing it. */
export async function generateMediaArtwork(env, { prompt, model_id, image_options = {}, actor_id }) {
  if (!actor_id) throw new Error("actor_required");
  const modelId = String(model_id || "").trim();
  if (!/^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{1,160}$/.test(modelId)) {
    throw new Error("image_generation_model_required");
  }
  const catalog = await env.DB.prepare(
    `SELECT c.provider, c.api_model_id
     FROM agentsam_model_catalog c
     JOIN agentsam_model_policies p ON p.model_key = c.model_key
     WHERE c.api_model_id = ? AND c.is_active = 1 AND c.show_in_picker = 1
       AND p.is_active = 1 AND p.routing_eligible = 1
       AND (c.model_kind LIKE 'image%' OR c.api_model_id LIKE 'gpt-image-%'
            OR c.api_model_id = 'chatgpt-image-latest') LIMIT 1`,
  ).bind(modelId).first();
  if (!catalog) throw new Error("image_generation_model_not_registered");

  const { generateRegisteredImage } = await import("../agentsam/media-image-runtime.js");
  const result = await generateRegisteredImage(env, {
    model_id: modelId,
    provider: catalog.provider === "cloudflare" ? "workers_ai" : catalog.provider,
    task_type: "image_generation",
  }, prompt, image_options);
  const mime = result.mime_type;
  const format = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" }[mime];
  if (!format) throw new Error("invalid_generated_image_format");
  const bytes = Uint8Array.from(atob(result.image_base64), (char) => char.charCodeAt(0));
  if (!bytes.length || bytes.length > MAX_DERIVATIVE) throw new Error("generated_image_too_large");
  const key = `studio/artwork/generated/${crypto.randomUUID()}.${format}`;
  const title = String(prompt || "artwork").trim().replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60) || "artwork";
  const meta = {
    lifecycle: "ready", media_role: "artwork", transform_policy: "preserve",
    generation: { provider: catalog.provider, model_id: modelId,
      prompt: String(prompt || "").slice(0, 1000), actor_id,
      created_at: new Date().toISOString(), status: "candidate_unplaced" },
  };
  await env.WEBSITE_ASSETS.put(key, bytes, { httpMetadata: { contentType: mime } });
  try {
    const insert = await env.DB.prepare(
      `INSERT INTO media_assets
       (r2_key,url,filename,content_type,size_bytes,category,folder,display_order,meta_json,updated_at)
       VALUES (?,?,?,?,?,'generated_artwork','images',0,?,datetime('now'))`,
    ).bind(key, mediaPathForKey(key), `${title}.${format}`, mime, bytes.length,
      JSON.stringify(meta)).run();
    const row = await env.DB.prepare("SELECT id,url,filename,content_type,folder FROM media_assets WHERE id = ?")
      .bind(insert.meta.last_row_id).first();
    if (!row) throw new Error("generated_image_registration_missing");
    return { ok: true, asset: { ...row, meta }, placed: false, source_preserved: true };
  } catch {
    await env.WEBSITE_ASSETS.delete(key).catch(() => null);
    throw new Error("generated_image_registration_failed");
  }
}
