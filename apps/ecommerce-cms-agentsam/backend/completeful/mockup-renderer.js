/**
 * Completeful mockup matrix: exact selected color x print location.
 * Provider images and render receipts become immutable Media Library derivatives.
 * Never replace a missing supplier photo with an unrelated garment silhouette.
 */
import { assertCompletefulMutationAllowed, completefulRequest } from "./client.js";
import { mediaPathForKey } from "../assets/config.js";

function parse(value, fallback) {
  try { return value == null ? fallback : typeof value === "string" ? JSON.parse(value) : value; }
  catch { return fallback; }
}
function nonblank(value) { return String(value ?? "").trim(); }
function slug(value) { return nonblank(value).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60) || "unknown"; }
function normalizeValues(values, max = 25) {
  if (values == null) return null;
  if (!Array.isArray(values) || values.length > max) throw new Error("invalid_mockup_filter");
  return [...new Set(values.map(nonblank).filter(Boolean))];
}
function attrsOf(row) {
  return { ...parse(row.attributes_json, {}), ...parse(row.variant_attributes_json, {}) };
}
function colorOf(attrs) {
  return Object.entries(attrs).find(([key]) => /^colou?r$/i.test(key))?.[1] || null;
}
function matchesScope(scope, attrs) {
  return Object.entries(scope).length > 0 && Object.entries(scope).every(([key, value]) =>
    Object.entries(attrs).some(([axis, actual]) =>
      axis.toLowerCase() === key.toLowerCase() && String(actual).toLowerCase() === String(value).toLowerCase()));
}
function operationKey(meta) {
  return "completeful-mockup-v1::" +
    [meta.draft_id, meta.version, meta.mockup_id, meta.print_location_id, meta.variant_color]
      .map((part) => encodeURIComponent(String(part))).join("::");
}
function parseOperationKey(key) {
  if (!String(key).startsWith("completeful-mockup-v1::")) throw new Error("invalid_mockup_receipt");
  const parts = String(key).slice("completeful-mockup-v1::".length).split("::").map(decodeURIComponent);
  if (parts.length !== 5) throw new Error("invalid_mockup_receipt");
  return { draft_id: parts[0], version: parts[1], mockup_id: parts[2],
    print_location_id: parts[3], variant_color: parts[4] };
}

export async function planCompletefulMockupMatrix(env, input = {}) {
  const draftId = nonblank(input.draft_id);
  if (!draftId) throw new Error("draft_id_required");
  const colors = normalizeValues(input.colors);
  const locationsFilter = normalizeValues(input.print_location_ids);
  const draft = await env.DB.prepare("SELECT * FROM product_studio_drafts WHERE id = ?")
    .bind(draftId).first();
  if (!draft) throw new Error("mockup_draft_not_found");
  const sourceId = Number(draft.prepared_media_asset_id);
  if (!Number.isSafeInteger(sourceId) || sourceId < 1) {
    throw new Error("prepare_artwork_before_mockup");
  }
  const art = await env.DB.prepare("SELECT * FROM media_assets WHERE id = ?").bind(sourceId).first();
  if (!art || !art.r2_key) throw new Error("prepared_artwork_not_found");
  const selectedVariants = parse(draft.selected_variant_ids_json, []);
  const selectedLocations = parse(draft.print_locations_json, []);
  const productId = draft.completeful_catalog_product_id;
  if (!selectedVariants.length || !selectedLocations.length || !productId) {
    throw new Error("mockup_selection_incomplete");
  }

  const [{ results: variants = [] }, { results: locations = [] }, { results: mockups = [] }] = await Promise.all([
    env.DB.prepare("SELECT * FROM completeful_catalog_variants WHERE completeful_product_id = ?")
      .bind(productId).all(),
    env.DB.prepare("SELECT * FROM completeful_catalog_print_locations WHERE completeful_product_id = ? AND enabled = 1")
      .bind(productId).all(),
    env.DB.prepare("SELECT * FROM completeful_catalog_mockups WHERE completeful_product_id = ? AND active = 1 ORDER BY sort_order, mockup_id")
      .bind(productId).all(),
  ]);
  const chosenVariants = variants.filter((v) => selectedVariants.includes(v.completeful_variant_id));
  const chosenLocations = locations.filter((location) =>
    selectedLocations.includes(location.print_location_id) &&
    (!locationsFilter || locationsFilter.includes(location.print_location_id)));
  if (chosenVariants.length !== selectedVariants.length || chosenLocations.length === 0) {
    throw new Error("supplier_variant_or_location_changed");
  }
  const matrix = [], skipped = [], seen = new Set();
  for (const location of chosenLocations) {
    const targets = mockups.filter((m) => m.print_location_id === location.print_location_id);
    for (const variant of chosenVariants) {
      const attrs = attrsOf(variant);
      const color = nonblank(colorOf(attrs));
      if (colors && !colors.some((value) => value.toLowerCase() === color.toLowerCase())) continue;
      if (!color) { skipped.push({ variant_id: variant.completeful_variant_id, print_location_id: location.print_location_id, reason: "variant_color_unverified" }); continue; }
      const chosen = targets.find((m) => matchesScope(parse(m.variant_scope_json, {}), attrs));
      if (!chosen) {
        skipped.push({ variant_color: color, print_location_id: location.print_location_id, reason: "exact_provider_mockup_missing" });
        continue;
      }
      const key = [chosen.mockup_id, location.print_location_id, color.toLowerCase()].join("::");
      if (seen.has(key)) continue; // size variants of the same color share one mockup
      seen.add(key);
      matrix.push({
        draft_id: draft.id, version: draft.version,
        mockup_id: chosen.mockup_id, print_location_id: location.print_location_id,
        variant_color: color, variant_ids: chosenVariants
          .filter((v) => String(colorOf(attrsOf(v))).toLowerCase() === color.toLowerCase())
          .map((v) => v.completeful_variant_id),
        preview_url: chosen.preview_url || null,
      });
    }
  }
  return { ok: true, draft_id: draft.id, product_id: productId, source: art, matrix, skipped };
}

function artUrl(env, source) {
  if (/^https:\/\//i.test(source.url || "")) return source.url;
  // Only configured worker or CDN authority may expose an asset to the provider.
  const host = String(env.APP_DOMAIN || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const publicBase = String(env.ASSET_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (host) return `https://${host}/media/${source.r2_key}`;
  if (/^https:\/\//i.test(publicBase)) return publicBase + "/" + source.r2_key;
  throw new Error("public_media_delivery_not_configured");
}
function supportedProviderImage(url) {
  const parsed = new URL(String(url));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
    /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?)/i.test(parsed.hostname)) {
    throw new Error("unsafe_provider_mockup_url");
  }
  return parsed.href;
}
function mimeAndExtension(bytes) {
  if (bytes.length > 32 && [137,80,78,71,13,10,26,10].every((n,i) => n === bytes[i]))
    return { mime: "image/png", ext: "png" };
  if (bytes.length > 32 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return { mime: "image/jpeg", ext: "jpg" };
  if (bytes.length > 32 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8,12)) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  throw new Error("invalid_provider_mockup_file");
}
export async function persistCompletefulMockup(env, receipt, renderUrl, renderId) {
  const source = await env.DB.prepare("SELECT * FROM product_studio_drafts WHERE id = ?")
    .bind(receipt.draft_id).first();
  if (!source || String(source.version) !== String(receipt.version)) throw new Error("mockup_draft_version_changed");
  const url = supportedProviderImage(renderUrl);
  const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error("mockup_download_http_" + response.status);
  if (Number(response.headers.get("content-length") || 0) > 20 * 1024 * 1024) throw new Error("mockup_image_too_large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 20 * 1024 * 1024) throw new Error("mockup_image_too_large");
  const { mime, ext } = mimeAndExtension(bytes);
  const key = `products/${slug(source.product_id)}/mockups/${slug(receipt.draft_id)}/${slug(receipt.variant_color)}-${slug(receipt.print_location_id)}-${slug(renderId)}.${ext}`;
  const existing = await env.DB.prepare("SELECT * FROM media_assets WHERE r2_key = ?").bind(key).first();
  if (existing) return existing;
  const metadata = {
    lifecycle: "ready", media_role: "mockup",
    provider: "completeful", render_id: renderId, mockup_id: receipt.mockup_id,
    variant_color: receipt.variant_color, print_location_id: receipt.print_location_id,
    source_media_asset_id: source.prepared_media_asset_id, draft_id: receipt.draft_id,
    source: "completeful_provider_render",
  };
  await env.WEBSITE_ASSETS.put(key, bytes, { httpMetadata: { contentType: mime } });
  try {
    const inserted = await env.DB.prepare(
      `INSERT INTO media_assets
       (r2_key,url,filename,content_type,size_bytes,category,folder,display_order,meta_json,updated_at)
       VALUES (?,?,?,?,?,'completeful_mockup','products',0,?,datetime('now'))`,
    ).bind(key,mediaPathForKey(key),key.split("/").pop(),mime,bytes.length,JSON.stringify(metadata)).run();
    return await env.DB.prepare("SELECT * FROM media_assets WHERE id = ?").bind(inserted.meta.last_row_id).first();
  } catch {
    await env.WEBSITE_ASSETS.delete(key).catch(() => null);
    throw new Error("mockup_persist_failed");
  }
}

export async function renderCompletefulMockupMatrix(env, input = {}) {
  const plan = await planCompletefulMockupMatrix(env, input);
  if (!plan.matrix.length) return { ...plan, source: undefined, rendered: [], error: "no_exact_supplier_mockup_targets" };
  if (plan.matrix.length > 12) throw new Error("too_many_mockups_select_fewer_colors");
  assertCompletefulMutationAllowed(env);
  const output = [];
  const preparedUrl = artUrl(env, plan.source);
  for (const target of plan.matrix) {
    const operation_key = operationKey(target);
    const existing = await env.DB.prepare("SELECT * FROM completeful_operations WHERE operation_key = ?")
      .bind(operation_key).first();
    if (existing?.provider_resource_id) {
      output.push({ ...target, status: existing.status, render_id: existing.provider_resource_id, reused: true });
      continue;
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO completeful_operations
       (operation_key,operation_type,local_entity_type,local_entity_id,status,attempt_count,idempotency_key)
       VALUES (?,'mockup_render','product_studio_draft',?,'pending',1,?)`,
    ).bind(operation_key, target.draft_id, operation_key).run();
    try {
      const { data, meta } = await completefulRequest(env, "POST", "/mockups/renders", {
        idempotencyKey: operation_key,
        body: {
          mockup_id: target.mockup_id, art_url: preparedUrl,
          output: { format: "png", max_size: 1800, clip_to_print_area: true },
        },
      });
      const renderId = String(data?.render_id || "");
      if (!renderId) throw new Error("mockup_render_id_missing");
      const status = String(data?.status || "queued");
      await env.DB.prepare(
        "UPDATE completeful_operations SET provider_resource_id=?,provider_request_id=?,status=?,updated_at=datetime('now') WHERE operation_key=?",
      ).bind(renderId,meta?.request_id || null,status === "succeeded" ? "succeeded" : "pending",operation_key).run();
      let asset = null;
      if (status === "succeeded" && data?.mockups?.[0]?.url) {
        asset = await persistCompletefulMockup(env, target, data.mockups[0].url, renderId);
      }
      output.push({ ...target, render_id: renderId, status, asset: asset || null });
    } catch (error) {
      await env.DB.prepare(
        "UPDATE completeful_operations SET status='failed',error_code=?,updated_at=datetime('now') WHERE operation_key=?",
      ).bind(String(error?.code || error?.message || "render_failed").slice(0,100),operation_key).run();
      output.push({ ...target, status: "failed", error: String(error?.code || error?.message || "render_failed").slice(0,130) });
    }
  }
  return { ok: true, draft_id: plan.draft_id, rendered: output, skipped: plan.skipped };
}

export async function pollCompletefulMockupRender(env, renderId) {
  const operation = await env.DB.prepare(
    "SELECT * FROM completeful_operations WHERE provider_resource_id = ? AND operation_type = 'mockup_render' ORDER BY id DESC LIMIT 1",
  ).bind(String(renderId)).first();
  if (!operation || !String(operation.operation_key).startsWith("completeful-mockup-v1::")) {
    throw new Error("mockup_render_receipt_not_found");
  }
  const receipt = parseOperationKey(operation.operation_key);
  const { data } = await completefulRequest(env, "GET", `/mockups/renders/${encodeURIComponent(renderId)}`);
  const status = String(data?.status || "running");
  let asset = null;
  if (status === "succeeded" && data?.mockups?.[0]?.url) {
    asset = await persistCompletefulMockup(env, receipt, data.mockups[0].url, renderId);
  }
  await env.DB.prepare("UPDATE completeful_operations SET status=?,updated_at=datetime('now') WHERE id=?")
    .bind(status === "succeeded" ? "succeeded" : status === "failed" ? "failed" : "pending",operation.id).run();
  return { ok: true, status, render_id: renderId, receipt, asset };
}
