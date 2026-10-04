/**
 * Media library control plane.
 *
 * The reusable CMS must not assume one storage vendor. Ember Supply currently
 * uses the R2 adapter (WEBSITE_ASSETS), while the portable media contract also
 * supports provider-backed assets such as Cloudflare Images, Google Drive, or a
 * local filesystem/runtime. Folder membership and display_order are metadata
 * concerns and never imply a provider-side copy/move.
 *
 * Uploads on this adapter: intake → classify → enqueue job → process → ready.
 */

import {
  planAssetIngest,
  applyAcceptedSuggestions,
  guessMimeFromKey,
  deliveryUrlForKey,
  mediaPathForKey,
  publicUrlsForKey,
  ASSET_STORAGE,
  createAssetJob,
  enqueueAssetJob,
  processAssetJobById,
} from "../assets/product-optimize.js";
import { mediaSourceFromRow } from "../media/provider-contract.js";
import { collectionMetaFromDraft } from "../media/collection-contract.js";

const MEDIA_FOLDERS = ["images", "videos", "products"];

export function mediaCapabilitySummary(env = {}) {
  const sourceProvider = String(
    env.MEDIA_SOURCE_PROVIDER || (env.WEBSITE_ASSETS ? "r2" : "external")
  );
  const transformProvider = env.MEDIA_TRANSFORM_PROVIDER
    ? String(env.MEDIA_TRANSFORM_PROVIDER)
    : env.IMAGES
      ? "cf_images"
      : null;
  return {
    source_provider: sourceProvider,
    transform_provider: transformProvider,
    browser_preview: true,
    can_materialize_derivatives: Boolean(transformProvider),
  };
}

const VIDEO_EXTS = new Set(["mp4", "mov", "webm", "m4v", "glb", "usdz"]);
const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"]);
const NON_MEDIA_EXTS = new Set([
  "json",
  "jsonl",
  "txt",
  "xml",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "ts",
  "tsx",
  "map",
  "sql",
  "md",
  "csv",
  "log",
  "yml",
  "yaml",
  "env",
  "lock",
  "gitignore",
]);

/**
 * SQL equivalent of isBrowsableMedia().
 *
 * This predicate belongs in the query itself. Filtering after LIMIT/OFFSET made
 * internal storage objects consume media-library pages and inflated totals.
 */
export function browsableMediaSql(alias = "m") {
  const a = String(alias || "m").replace(/[^a-zA-Z0-9_]/g, "") || "m";
  const key = "lower(COALESCE(" + a + ".r2_key, " + a + ".filename, ''))";
  const ct = "lower(COALESCE(" + a + ".content_type, ''))";
  return "(" +
    ct + " LIKE 'image/%' OR " +
    ct + " LIKE 'video/%' OR " +
    ct + " LIKE 'model/%' OR " +
    key + " GLOB '*.jpg' OR " + key + " GLOB '*.jpeg' OR " +
    key + " GLOB '*.png' OR " + key + " GLOB '*.gif' OR " +
    key + " GLOB '*.webp' OR " + key + " GLOB '*.svg' OR " +
    key + " GLOB '*.avif' OR " +
    key + " GLOB '*.mp4' OR " + key + " GLOB '*.mov' OR " +
    key + " GLOB '*.webm' OR " + key + " GLOB '*.m4v' OR " +
    key + " GLOB '*.glb' OR " + key + " GLOB '*.gltf' OR " +
    key + " GLOB '*.usdz')";
}

function json(data, init = {}) {
  return Response.json(data, init);
}

function sanitizeFilename(name) {
  const lastDot = name.lastIndexOf(".");
  const base = lastDot === -1 ? name : name.slice(0, lastDot);
  const ext = lastDot === -1 ? "" : name.slice(lastDot).toLowerCase();
  const cleanBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
  return (cleanBase || "file") + ext.replace(/[^a-z0-9.]/g, "");
}

function extensionOf(key) {
  const name = key.split("/").pop() || "";
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
}

function guessContentType(key) {
  return guessMimeFromKey(key);
}

function parseMeta(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveContentType(row) {
  const key = row?.r2_key || row?.filename || "";
  const ct = String(row?.content_type || "").toLowerCase();
  if (ct && ct !== "application/octet-stream") return row.content_type;
  return guessContentType(key);
}

function publicUrlFields(row) {
  const source = mediaSourceFromRow(row);
  if (source.provider === "r2" && source.key) {
    const key = String(source.key).replace(/^\/+/, "");
    const urls = publicUrlsForKey(key);
    return {
      source,
      url: mediaPathForKey(key),
      delivery_url: deliveryUrlForKey(key, { preferWorker: true }),
      cdn_url: urls.cdn,
      public_base_url: ASSET_STORAGE.publicBaseUrl,
    };
  }

  const url = source.url || row?.url || null;
  return {
    source,
    url,
    delivery_url: url,
    cdn_url: null,
    public_base_url: null,
  };
}

function inferFolder(r2Key, contentType = "") {
  const key = (r2Key || "").toLowerCase();
  const ext = extensionOf(key);
  if (key.startsWith("products/")) return "products";
  if (
    VIDEO_EXTS.has(ext) ||
    key.includes("/videos/") ||
    key.includes("/3d-models/")
  ) {
    return "videos";
  }
  if ((contentType || "").startsWith("video/") || (contentType || "").startsWith("model/")) {
    return "videos";
  }
  return "images";
}

export function isBrowsableMedia(row) {
  const key = row?.r2_key || row?.filename || "";
  const ext = extensionOf(key);
  if (NON_MEDIA_EXTS.has(ext)) return false;

  const ct = String(row?.content_type || guessContentType(key)).toLowerCase();
  if (ct === "application/json" || ct === "application/ld+json") return false;
  if (ct.startsWith("text/") && !ct.startsWith("image/")) return false;

  if (ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("model/")) return true;
  if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)) return true;

  if (ct === "application/octet-stream" && IMAGE_EXTS.has(ext)) return true;
  return false;
}

function normalizeFolder(folder) {
  const f = (folder || "images").toLowerCase();
  return MEDIA_FOLDERS.includes(f) ? f : "images";
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function uniqueKey(env, prefix, filename) {
  let key = prefix + filename;
  const existing = await env.DB.prepare(`SELECT 1 FROM media_assets WHERE r2_key = ?`)
    .bind(key)
    .first();
  if (!existing) return key;

  const lastDot = filename.lastIndexOf(".");
  const base = lastDot === -1 ? filename : filename.slice(0, lastDot);
  const ext = lastDot === -1 ? "" : filename.slice(lastDot);
  for (let i = 2; i < 1000; i++) {
    key = `${prefix}${base}-${i}${ext}`;
    const row = await env.DB.prepare(`SELECT 1 FROM media_assets WHERE r2_key = ?`)
      .bind(key)
      .first();
    if (!row) return key;
  }
  return `${prefix}${base}-${Date.now()}${ext}`;
}

async function nextDisplayOrder(env, folder) {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(display_order), 0) AS n FROM media_assets WHERE folder = ?`
  )
    .bind(folder)
    .first();
  return (row?.n || 0) + 1;
}

function rowToAsset(row) {
  let placement = null;
  if (row.placement_json) {
    try {
      placement = JSON.parse(row.placement_json);
    } catch {
      placement = null;
    }
  }
  const contentType = resolveContentType(row);
  const urls = publicUrlFields(row);
  const meta = parseMeta(row.meta_json);
  const jobStatus = String(row.processing_status || "").toLowerCase();
  const lifecycle =
    jobStatus || meta?.lifecycle || (meta?.optimization?.status === "ready" ? "ready" : null) || "ready";
  const opt = meta?.optimization || null;
  const processingResult = parseMeta(row.processing_result) || null;
  const preparedVersions = processingResult?.transformed
    ? [{
        label: "Storefront",
        kind: processingResult.asset_role || "canonical",
        width: processingResult.width || null,
        height: processingResult.height || null,
        format: String(processingResult.content_type || "").replace(/^image\//, "").toUpperCase() || null,
        bytes: processingResult.output_bytes || null,
        provider: urls.source?.provider || "storage",
        key: processingResult.canonical_key || null,
      }]
    : [];
  return {
    id: row.id,
    source: urls.source,
    r2_key: row.r2_key,
    url: urls.url,
    delivery_url: urls.delivery_url,
    cdn_url: urls.cdn_url,
    public_base_url: urls.public_base_url,
    filename: row.filename,
    content_type: contentType,
    size_bytes: row.size_bytes,
    category: row.category,
    folder: row.folder || inferFolder(row.r2_key, contentType),
    display_order: row.display_order ?? 0,
    alt_text: row.alt_text || "",
    placement,
    meta,
    /** Operator-facing lifecycle — never expose pipeline jargon. */
    status:
      lifecycle === "processing" || lifecycle === "uploading" || lifecycle === "queued" || lifecycle === "running"
        ? "processing"
        : lifecycle === "failed" || lifecycle === "error"
          ? "failed"
          : "ready",
    processing_error: row.processing_error || null,
    display: opt
      ? {
          format: (opt.output_format || contentType || "").replace(/^image\//, "").toUpperCase() || null,
          width: opt.width || null,
          height: opt.height || null,
          bytes: opt.output_bytes || row.size_bytes || null,
        }
      : {
          format: (contentType || "").replace(/^image\//, "").replace(/^video\//, "").replace(/^model\//, "").toUpperCase() || null,
          width: null,
          height: null,
          bytes: row.size_bytes || null,
        },
    suggestions: meta?.intelligence?.suggestions || meta?.suggestions || null,
    prepared_versions: preparedVersions,
    usage: [],
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

const MEDIA_SELECT = `SELECT m.*,
  (SELECT j.status FROM media_asset_jobs j WHERE j.media_asset_id = m.id ORDER BY j.updated_at DESC LIMIT 1) AS processing_status,
  (SELECT j.last_error FROM media_asset_jobs j WHERE j.media_asset_id = m.id ORDER BY j.updated_at DESC LIMIT 1) AS processing_error,
  (SELECT j.result_json FROM media_asset_jobs j WHERE j.media_asset_id = m.id AND j.status = 'succeeded' ORDER BY j.updated_at DESC LIMIT 1) AS processing_result
  FROM media_assets m`;

async function folderCounts(env) {
  const { results } = await env.DB.prepare(
    "SELECT folder, COUNT(*) AS n FROM media_assets m WHERE " +
      browsableMediaSql("m") +
      " GROUP BY folder"
  ).all();
  const counts = { images: 0, videos: 0, products: 0 };
  for (const row of results || []) {
    const f = normalizeFolder(row.folder);
    counts[f] = (counts[f] || 0) + Number(row.n || 0);
  }
  return counts;
}

export async function syncMediaFromR2(env) {
  const { results: existingRows } = await env.DB.prepare(`SELECT r2_key FROM media_assets`).all();
  const existingKeys = new Set(existingRows.map((r) => r.r2_key));

  let cursor;
  let inserted = 0;
  let scanned = 0;

  do {
    const page = await env.WEBSITE_ASSETS.list({ cursor, limit: 1000 });
    for (const obj of page.objects) {
      scanned += 1;
      if (existingKeys.has(obj.key)) continue;

      const filename = obj.key.split("/").pop() || obj.key;
      const contentType = guessContentType(obj.key);
      if (!isBrowsableMedia({ r2_key: obj.key, content_type: contentType, filename })) continue;

      const folder = inferFolder(obj.key, contentType);
      const order = await nextDisplayOrder(env, folder);

      await env.DB.prepare(
        `INSERT INTO media_assets
           (r2_key, url, filename, content_type, size_bytes, category, folder, display_order, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          obj.key,
          mediaPathForKey(obj.key),
          filename,
          contentType,
          obj.size,
          null,
          folder,
          order
        )
        .run();

      existingKeys.add(obj.key);
      inserted += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // Normalize folder on rows that predate virtual folders
  await env.DB.prepare(
    `UPDATE media_assets SET folder = 'products' WHERE r2_key LIKE 'products/%' AND folder != 'products'`
  ).run();
  await env.DB.prepare(
    `UPDATE media_assets SET folder = 'videos'
     WHERE (lower(r2_key) LIKE '%.mp4' OR lower(r2_key) LIKE '%.mov' OR lower(r2_key) LIKE '%.webm'
            OR lower(r2_key) LIKE '%.glb' OR lower(r2_key) LIKE '%.usdz'
            OR r2_key LIKE 'archive/shopify-import/videos/%'
            OR r2_key LIKE 'archive/shopify-import/3d-models/%')
       AND folder != 'videos'`
  ).run();

  // Fix stale application/octet-stream for known media extensions (black-thumb root cause).
  const mimeFixes = [
    ["%.jpg", "image/jpeg"],
    ["%.jpeg", "image/jpeg"],
    ["%.png", "image/png"],
    ["%.gif", "image/gif"],
    ["%.webp", "image/webp"],
    ["%.svg", "image/svg+xml"],
    ["%.mp4", "video/mp4"],
    ["%.webm", "video/webm"],
    ["%.mov", "video/quicktime"],
    ["%.glb", "model/gltf-binary"],
    ["%.usdz", "model/vnd.usdz+zip"],
  ];
  for (const [like, mime] of mimeFixes) {
    await env.DB.prepare(
      `UPDATE media_assets
       SET content_type = ?, updated_at = datetime('now')
       WHERE lower(r2_key) LIKE ? AND (content_type IS NULL OR content_type = '' OR content_type = 'application/octet-stream')`
    )
      .bind(mime, like)
      .run();
  }

  // Prefer /media/ compatibility paths in D1; delivery_url is derived at read time.
  await env.DB.prepare(
    `UPDATE media_assets
     SET url = '/media/' || r2_key
     WHERE url IS NULL OR url = '' OR url LIKE 'https://assets.ember.example/%'`
  ).run();

  return { ok: true, scanned, inserted, counts: await folderCounts(env) };
}

export async function uploadMedia(request, env, executionCtx = null) {
  const form = await request.formData();
  const files = form.getAll("files").filter((f) => f && typeof f.arrayBuffer === "function");
  if (!files.length) return json({ error: "No files provided" }, { status: 400 });

  const category = form.get("category") ? form.get("category").toString() : null;
  const folderHint = form.get("folder") ? normalizeFolder(form.get("folder").toString()) : null;
  let prefix = (form.get("prefix") || "intake/").toString();
  if (!prefix.endsWith("/")) prefix += "/";
  prefix = prefix.replace(/^\/+/, "");

  const created = [];
  for (const file of files) {
    const filename = sanitizeFilename(file.name || "upload");
    const intakeKey = await uniqueKey(env, prefix, filename);
    const buf = await file.arrayBuffer();
    const contentType = file.type || guessContentType(intakeKey);
    const folder = folderHint || inferFolder(intakeKey, contentType);
    const displayOrder = await nextDisplayOrder(env, folder);

    await env.WEBSITE_ASSETS.put(intakeKey, buf, { httpMetadata: { contentType } });

    const plan = planAssetIngest({
      r2Key: intakeKey,
      contentType,
      bytes: buf.byteLength,
      filename,
      folder,
    });

    const urls = publicUrlFields(intakeKey);
    const meta = {
      ...plan.meta,
      lifecycle: "processing",
      intelligence: plan.intelligence,
      tags: plan.tags,
      // Keep workflow keys in diagnostics only — never operator-facing.
      _diagnostics: {
        workflow_key: plan.workflow_key,
        transform_state: plan.transform_state,
        canonical_key: plan.canonical_key,
      },
    };

    let result;
    try {
      result = await env.DB.prepare(
        `INSERT INTO media_assets
           (r2_key, url, filename, content_type, size_bytes, category, folder, display_order, meta_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
        .bind(
          intakeKey,
          urls.url,
          filename,
          contentType,
          buf.byteLength,
          category,
          folder,
          displayOrder,
          JSON.stringify(meta),
        )
        .run();
    } catch (err) {
      if (String(err?.message || err).includes("meta_json")) {
        result = await env.DB.prepare(
          `INSERT INTO media_assets
             (r2_key, url, filename, content_type, size_bytes, category, folder, display_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
          .bind(
            intakeKey,
            urls.url,
            filename,
            contentType,
            buf.byteLength,
            category,
            folder,
            displayOrder,
          )
          .run();
      } else {
        throw err;
      }
    }

    const mediaId = result.meta.last_row_id;
    let jobId = null;
    let queued = false;
    try {
      jobId = await createAssetJob(env, {
        mediaAssetId: mediaId,
        intakeKey,
        canonicalKey: plan.canonical_key,
        pipeline: plan.classification?.pipeline,
        plan,
      });
      const enq = await enqueueAssetJob(env, jobId, { media_asset_id: mediaId });
      queued = !!enq?.queued;
    } catch (err) {
      console.error("[media/upload] job create/enqueue failed", err?.message || err);
    }

    // Queue is primary. Inline/waitUntil only when ASSET_JOBS binding is absent.
    if (jobId && !queued) {
      const runJob = processAssetJobById(env, jobId, { runtime: "worker" }).catch((err) => {
        console.error("[media/upload] fallback auto-process failed", jobId, err?.message || err);
      });
      if (typeof executionCtx?.waitUntil === "function") {
        executionCtx.waitUntil(runJob);
      } else {
        await runJob;
      }
    }

    // Re-read after possible inline finalize.
    const fresh =
      (await env.DB.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(mediaId).first()) || {
        id: mediaId,
        r2_key: intakeKey,
        url: urls.url,
        filename,
        content_type: contentType,
        size_bytes: buf.byteLength,
        category,
        folder,
        display_order: displayOrder,
        alt_text: "",
        meta_json: JSON.stringify(meta),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

    const asset = rowToAsset(fresh);
    created.push({
      ...asset,
      job_id: jobId,
      suggestions: plan.intelligence?.suggestions || null,
    });
  }

  return json({ ok: true, assets: created });
}

function albumSlug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "album";
}

async function availableAlbumSlug(env, name, excludeId = null) {
  const base = albumSlug(name);
  let candidate = base;
  for (let index = 2; index < 1000; index += 1) {
    const row = excludeId
      ? await env.DB.prepare("SELECT id FROM media_albums WHERE slug = ? AND id <> ?").bind(candidate, excludeId).first()
      : await env.DB.prepare("SELECT id FROM media_albums WHERE slug = ?").bind(candidate).first();
    if (!row) return candidate;
    candidate = (base + "-" + index).slice(0, 80);
  }
  return base + "-" + Date.now();
}

async function listMediaAlbumRows(env) {
  const sql =
    "SELECT a.id,a.slug,a.name,a.description,a.cover_media_asset_id,a.meta_json,a.created_at,a.updated_at," +
    " COUNT(maa.media_asset_id) AS asset_count," +
    " COALESCE(a.cover_media_asset_id, MIN(maa.media_asset_id)) AS resolved_cover_media_asset_id" +
    " FROM media_albums a" +
    " LEFT JOIN media_album_assets maa ON maa.album_id = a.id" +
    " GROUP BY a.id" +
    " ORDER BY lower(a.name), a.id";
  const { results } = await env.DB.prepare(sql).all();
  return (results || []).map((row) => ({
    ...row,
    id: Number(row.id),
    asset_count: Number(row.asset_count || 0),
    meta: parseMeta(row.meta_json) || {},
    cover_media_asset_id: row.cover_media_asset_id == null ? null : Number(row.cover_media_asset_id),
    resolved_cover_media_asset_id:
      row.resolved_cover_media_asset_id == null ? null : Number(row.resolved_cover_media_asset_id),
  }));
}

export async function listMediaAlbums(request, env) {
  return json({ ok: true, albums: await listMediaAlbumRows(env) });
}

export async function createMediaAlbum(request, env) {
  const body = await readJson(request);
  const name = String(body?.name || "").trim().slice(0, 120);
  const description = String(body?.description || "").trim().slice(0, 1000);
  if (!name) return json({ error: "name required" }, { status: 400 });

  let meta;
  try {
    meta = collectionMetaFromDraft({
      name,
      description,
      kind: body?.kind || "album",
      status: body?.status || "draft",
      presentation: body?.presentation || {},
    });
  } catch (error) {
    return json({ error: String(error?.message || error) }, { status: 400 });
  }

  const slug = await availableAlbumSlug(env, name);
  const sql =
    "INSERT INTO media_albums (slug,name,description,meta_json,created_at,updated_at)" +
    " VALUES (?,?,?,?,datetime('now'),datetime('now'))";
  const result = await env.DB.prepare(sql).bind(slug, name, description || null, JSON.stringify(meta)).run();
  const id = Number(result?.meta?.last_row_id || 0);
  const album = id
    ? await env.DB.prepare("SELECT * FROM media_albums WHERE id = ?").bind(id).first()
    : await env.DB.prepare("SELECT * FROM media_albums WHERE slug = ?").bind(slug).first();
  return json({
    ok: true,
    album: { ...album, id: Number(album.id), asset_count: 0, meta: parseMeta(album.meta_json) || {} },
  }, { status: 201 });
}

export async function updateMediaAlbum(request, env, id) {
  const albumId = Number(id);
  if (!Number.isInteger(albumId) || albumId <= 0) return json({ error: "invalid album id" }, { status: 400 });
  const existing = await env.DB.prepare("SELECT * FROM media_albums WHERE id = ?").bind(albumId).first();
  if (!existing) return json({ error: "album not found" }, { status: 404 });

  const body = await readJson(request);
  const name = body?.name == null ? existing.name : String(body.name).trim().slice(0, 120);
  const description = body?.description == null
    ? existing.description
    : String(body.description).trim().slice(0, 1000);
  if (!name) return json({ error: "name required" }, { status: 400 });

  const slug = name === existing.name ? existing.slug : await availableAlbumSlug(env, name, albumId);
  const cover = body?.cover_media_asset_id === undefined
    ? existing.cover_media_asset_id
    : body.cover_media_asset_id == null
      ? null
      : Number(body.cover_media_asset_id);

  if (cover != null) {
    const membership = await env.DB.prepare(
      "SELECT 1 AS ok FROM media_album_assets WHERE album_id = ? AND media_asset_id = ?"
    ).bind(albumId, cover).first();
    if (!membership) return json({ error: "cover asset must belong to album" }, { status: 400 });
  }

  const sql =
    "UPDATE media_albums SET slug=?,name=?,description=?,cover_media_asset_id=?," +
    " updated_at=datetime('now') WHERE id=?";
  await env.DB.prepare(sql).bind(slug, name, description || null, cover, albumId).run();
  return json({
    ok: true,
    album: (await listMediaAlbumRows(env)).find((row) => row.id === albumId) || null,
  });
}

export async function deleteMediaAlbum(request, env, id) {
  const albumId = Number(id);
  if (!Number.isInteger(albumId) || albumId <= 0) return json({ error: "invalid album id" }, { status: 400 });
  await env.DB.prepare("DELETE FROM media_albums WHERE id = ?").bind(albumId).run();
  return json({ ok: true, id: albumId });
}

export async function listMedia(request, env, url) {
  const folderParam = url.searchParams.get("folder");
  const view = url.searchParams.get("view") || "images";
  const prefix = (url.searchParams.get("prefix") || "").trim().replace(/^\/+/, "");
  const doSync = url.searchParams.get("sync") === "1";
  const page = Math.max(1, Math.round(Number(url.searchParams.get("page") || 1)));
  const pageSize = Math.max(12, Math.min(100, Math.round(Number(url.searchParams.get("page_size") || 48))));
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const kind = String(url.searchParams.get("kind") || "all").trim().toLowerCase();
  const status = String(url.searchParams.get("status") || "all").trim().toLowerCase();
  const sort = String(url.searchParams.get("sort") || "newest").trim().toLowerCase();
  const albumId = Math.max(0, Math.round(Number(url.searchParams.get("album_id") || 0)));

  if (doSync) {
    try {
      await syncMediaFromR2(env);
    } catch (err) {
      console.error("media sync failed", err);
    }
  }

  const counts = await folderCounts(env);
  const albums = await listMediaAlbumRows(env);
  // Browsability is part of the database query so non-media registry rows can
  // never consume pagination slots or inflate totals.
  const clauses = [browsableMediaSql("m")];
  const binds = [];

  if (prefix) {
    clauses.push("m.r2_key LIKE ?");
    binds.push(`${prefix.replace(/[%_]/g, "")}%`);
  } else if (folderParam && MEDIA_FOLDERS.includes(folderParam)) {
    clauses.push("m.folder = ?");
    binds.push(folderParam);
  } else if (view !== "all") {
    clauses.push("m.folder = 'images'");
  }

  if (albumId) {
    clauses.push("EXISTS (SELECT 1 FROM media_album_assets maa WHERE maa.media_asset_id = m.id AND maa.album_id = ?)");
    binds.push(albumId);
  }

  if (q) {
    const needle = `%${q.replace(/[%_]/g, "")}%`;
    clauses.push(`(
      lower(COALESCE(m.filename,'')) LIKE ? OR
      lower(COALESCE(m.alt_text,'')) LIKE ? OR
      lower(COALESCE(m.category,'')) LIKE ? OR
      lower(COALESCE(m.r2_key,'')) LIKE ? OR
      lower(COALESCE(m.meta_json,'')) LIKE ?
    )`);
    binds.push(needle, needle, needle, needle, needle);
  }

  if (kind === "image") {
    clauses.push(`(
      lower(COALESCE(m.content_type,'')) LIKE 'image/%' OR
      lower(m.r2_key) GLOB '*.jpg' OR lower(m.r2_key) GLOB '*.jpeg' OR
      lower(m.r2_key) GLOB '*.png' OR lower(m.r2_key) GLOB '*.gif' OR
      lower(m.r2_key) GLOB '*.webp' OR lower(m.r2_key) GLOB '*.svg' OR
      lower(m.r2_key) GLOB '*.avif'
    )`);
  } else if (kind === "video") {
    clauses.push(`(
      lower(COALESCE(m.content_type,'')) LIKE 'video/%' OR
      lower(m.r2_key) GLOB '*.mp4' OR lower(m.r2_key) GLOB '*.mov' OR
      lower(m.r2_key) GLOB '*.webm' OR lower(m.r2_key) GLOB '*.m4v'
    )`);
  } else if (kind === "model") {
    clauses.push(`(
      lower(COALESCE(m.content_type,'')) LIKE 'model/%' OR
      lower(m.r2_key) GLOB '*.glb' OR lower(m.r2_key) GLOB '*.gltf' OR
      lower(m.r2_key) GLOB '*.usdz'
    )`);
  }

  const latestStatus = `(SELECT j.status FROM media_asset_jobs j
    WHERE j.media_asset_id = m.id ORDER BY j.updated_at DESC LIMIT 1)`;
  if (status === "processing") {
    clauses.push(`${latestStatus} IN ('queued','processing','running','uploading')`);
  } else if (status === "failed") {
    clauses.push(`${latestStatus} IN ('failed','error')`);
  } else if (status === "ready") {
    clauses.push(`COALESCE(${latestStatus}, 'ready') NOT IN ('queued','processing','running','uploading','failed','error')`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const manualOrder = albumId
    ? "ORDER BY COALESCE((SELECT maa.position FROM media_album_assets maa WHERE maa.album_id = " +
        albumId + " AND maa.media_asset_id = m.id), m.display_order) ASC, m.id ASC"
    : view === "all" && !folderParam && !prefix
      ? "ORDER BY m.folder ASC, m.display_order ASC, m.id ASC"
      : "ORDER BY m.display_order ASC, m.id ASC";
  const orderBy =
    sort === "manual" ? manualOrder :
    sort === "oldest" ? "ORDER BY COALESCE(m.updated_at, m.created_at) ASC, m.id ASC" :
    sort === "name" ? "ORDER BY lower(m.filename) ASC, m.id ASC" :
    sort === "largest" ? "ORDER BY COALESCE(m.size_bytes, 0) DESC, m.id DESC" :
    "ORDER BY COALESCE(m.updated_at, m.created_at) DESC, m.id DESC";

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM media_assets m ${where}`,
  ).bind(...binds).first();
  const total = Number(countRow?.n || 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages);
  const safeOffset = (safePage - 1) * pageSize;

  const { results } = await env.DB.prepare(
    `${MEDIA_SELECT} ${where} ${orderBy} LIMIT ? OFFSET ?`,
  ).bind(...binds, pageSize, safeOffset).all();

  const assets = (results || []).map(rowToAsset);

  if (assets.length) {
    const ids = assets.map((asset) => Number(asset.id)).filter(Number.isInteger);
    const placeholders = ids.map(() => "?").join(",");
    const usageByAsset = new Map(ids.map((id) => [id, []]));

    const { results: albumUsage } = await env.DB.prepare(
      `SELECT maa.media_asset_id, a.id, a.name, a.meta_json
       FROM media_album_assets maa
       JOIN media_albums a ON a.id = maa.album_id
       WHERE maa.media_asset_id IN (${placeholders})
       ORDER BY lower(a.name), a.id`,
    ).bind(...ids).all();
    for (const row of albumUsage || []) {
      const meta = parseMeta(row.meta_json) || {};
      usageByAsset.get(Number(row.media_asset_id))?.push({
        kind: meta.kind === "gallery" ? "Gallery" : "Album",
        id: Number(row.id),
        label: row.name,
      });
    }

    try {
      const { results: productUsage } = await env.DB.prepare(
        `SELECT pi.media_asset_id, p.id, p.title
         FROM product_images pi
         JOIN products p ON p.id = pi.product_id
         WHERE pi.media_asset_id IN (${placeholders})
         ORDER BY lower(p.title), p.id`,
      ).bind(...ids).all();
      for (const row of productUsage || []) {
        usageByAsset.get(Number(row.media_asset_id))?.push({
          kind: "Product",
          id: Number(row.id),
          label: row.title,
        });
      }
    } catch {
      // Some portable/test deployments intentionally omit commerce tables.
    }

    for (const asset of assets) asset.usage = usageByAsset.get(Number(asset.id)) || [];
  }

  return json({
    ok: true,
    assets,
    counts,
    folders: MEDIA_FOLDERS,
    albums,
    active_album_id: albumId || null,
    view: folderParam || view,
    prefix: prefix || null,
    pagination: {
      page: safePage,
      page_size: pageSize,
      total,
      pages,
      has_prev: safePage > 1,
      has_next: safePage < pages,
    },
    filters: { q, kind, status },
    capabilities: mediaCapabilitySummary(env),
  });
}

export async function batchMedia(request, env) {
  const body = await readJson(request);
  const ids = Array.isArray(body?.ids)
    ? [...new Set(body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 200)
    : [];
  const action = String(body?.action || "").trim();

  if (!ids.length) return json({ error: "ids required" }, { status: 400 });
  if (!["optimize", "move", "accept_suggestions", "album_add", "album_remove"].includes(action)) {
    return json({ error: "unsupported batch action" }, { status: 400 });
  }

  const placeholders = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT * FROM media_assets WHERE id IN (${placeholders})`,
  ).bind(...ids).all();
  const rows = results || [];

  if (action === "album_add" || action === "album_remove") {
    const albumId = Number(body?.album_id);
    if (!Number.isInteger(albumId) || albumId <= 0) {
      return json({ error: "album_id required" }, { status: 400 });
    }
    const album = await env.DB.prepare("SELECT id,name FROM media_albums WHERE id = ?").bind(albumId).first();
    if (!album) return json({ error: "album not found" }, { status: 404 });

    if (action === "album_remove") {
      for (const row of rows) {
        await env.DB.prepare("DELETE FROM media_album_assets WHERE album_id = ? AND media_asset_id = ?")
          .bind(albumId, row.id).run();
      }
      if (ids.length) {
        const coverPlaceholders = ids.map(() => "?").join(",");
        const sql = "UPDATE media_albums SET cover_media_asset_id = CASE WHEN cover_media_asset_id IN (" +
          coverPlaceholders + ") THEN NULL ELSE cover_media_asset_id END, updated_at = datetime('now') WHERE id = ?";
        await env.DB.prepare(sql).bind(...ids, albumId).run();
      }
      return json({ ok: true, action, album_id: albumId, updated: rows.length });
    }

    const maxRow = await env.DB.prepare(
      "SELECT COALESCE(MAX(position), -1) AS max_position FROM media_album_assets WHERE album_id = ?"
    ).bind(albumId).first();
    let position = Number(maxRow?.max_position ?? -1) + 1;
    let added = 0;
    for (const row of rows) {
      const result = await env.DB.prepare(
        "INSERT OR IGNORE INTO media_album_assets (album_id,media_asset_id,position,added_at) " +
        "VALUES (?,?,?,datetime('now'))"
      ).bind(albumId, row.id, position).run();
      const changes = Number(result?.meta?.changes || 0);
      if (changes) {
        added += 1;
        position += 1;
      }
    }
    await env.DB.prepare("UPDATE media_albums SET updated_at = datetime('now') WHERE id = ?")
      .bind(albumId).run();
    return json({ ok: true, action, album_id: albumId, added, requested: rows.length });
  }

  if (action === "move") {
    const folder = normalizeFolder(body?.folder);
    for (const row of rows) {
      await env.DB.prepare(
        `UPDATE media_assets SET folder = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(folder, row.id).run();
    }
    return json({ ok: true, action, updated: rows.length, folder, counts: await folderCounts(env) });
  }

  if (action === "accept_suggestions") {
    const fields = Array.isArray(body?.fields) && body.fields.length
      ? body.fields.map(String)
      : ["alt_text", "title", "tags"];
    let updated = 0;
    for (const row of rows) {
      const meta = parseMeta(row.meta_json) || {};
      const suggestions = meta.intelligence?.suggestions || meta.suggestions;
      if (!suggestions) continue;
      const applied = applyAcceptedSuggestions(
        {
          title: meta.title || row.filename,
          alt_text: row.alt_text || "",
          tags: meta.tags || [],
        },
        meta.intelligence || { suggestions, protected_fields: {} },
        fields,
      );
      const nextMeta = {
        ...meta,
        accepted_suggestions: applied.accepted,
        skipped_suggestions: applied.skipped,
        title: applied.metadata.title,
        tags: applied.metadata.tags,
      };
      const nextAlt = applied.metadata.alt_text != null
        ? String(applied.metadata.alt_text).slice(0, 500)
        : row.alt_text || "";
      await env.DB.prepare(
        `UPDATE media_assets
         SET alt_text = ?, meta_json = ?, updated_at = datetime('now')
         WHERE id = ?`,
      ).bind(nextAlt, JSON.stringify(nextMeta), row.id).run();
      updated += 1;
    }
    return json({ ok: true, action, updated, requested: ids.length });
  }

  const jobs = [];
  for (const row of rows) {
    if (!isBrowsableMedia(row)) continue;
    const meta = parseMeta(row.meta_json) || {};
    const plan = planAssetIngest({
      r2Key: row.r2_key,
      filename: row.filename,
      contentType: resolveContentType(row),
      bytes: row.size_bytes,
      folder: row.folder || inferFolder(row.r2_key, row.content_type),
      alt: row.alt_text || "",
      existingMeta: meta,
    });
    const jobId = await createAssetJob(env, {
      mediaAssetId: row.id,
      intakeKey: row.r2_key,
      canonicalKey: plan.canonical_key,
      pipeline: plan.classification?.pipeline,
      plan,
    });
    const queued = await enqueueAssetJob(env, jobId, {
      media_asset_id: row.id,
      source: "admin_media_batch",
    });
    jobs.push({ media_asset_id: row.id, job_id: jobId, queued: !!queued?.queued });
  }

  return json({ ok: true, action, requested: ids.length, jobs });
}

export async function updateMedia(request, env, id) {
  const body = await readJson(request);
  if (!body) return json({ error: "Invalid body" }, { status: 400 });

  const asset = await env.DB.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(id).first();
  if (!asset) return json({ error: "Not found" }, { status: 404 });

  const filename = body.filename != null ? String(body.filename).trim().slice(0, 255) : asset.filename;
  const altText = body.alt_text != null ? String(body.alt_text).trim().slice(0, 500) : asset.alt_text;
  const folder =
    body.folder != null ? normalizeFolder(body.folder) : normalizeFolder(asset.folder);
  const displayOrder =
    body.display_order != null ? Math.round(Number(body.display_order)) : asset.display_order;

  let placementJson = asset.placement_json;
  if (body.placement !== undefined) {
    if (body.placement === null) {
      placementJson = null;
    } else if (typeof body.placement === "object") {
      placementJson = JSON.stringify(body.placement);
    }
  }

  let meta = parseMeta(asset.meta_json) || {};
  if (Array.isArray(body.accept_suggestions) && body.accept_suggestions.length) {
    const applied = applyAcceptedSuggestions(
      {
        title: meta.title || filename,
        alt_text: altText,
        tags: meta.tags || [],
      },
      meta.intelligence || { suggestions: meta.suggestions, protected_fields: {} },
      body.accept_suggestions,
    );
    meta = {
      ...meta,
      accepted_suggestions: applied.accepted,
      skipped_suggestions: applied.skipped,
      title: applied.metadata.title,
      tags: applied.metadata.tags,
    };
    if (applied.accepted.includes("alt_text") && applied.metadata.alt_text != null) {
      // Only write alt when explicitly accepted and not protected.
    }
  }
  // Never silently overwrite human alt_text from suggestions unless accepted.
  let nextAlt = altText;
  if (
    Array.isArray(body.accept_suggestions) &&
    body.accept_suggestions.includes("alt_text") &&
    !(meta.intelligence?.protected_fields?.alt_text) &&
    meta.intelligence?.suggestions?.alt_text
  ) {
    nextAlt = String(meta.intelligence.suggestions.alt_text).slice(0, 500);
  }

  try {
    await env.DB.prepare(
      `UPDATE media_assets
       SET filename = ?, alt_text = ?, folder = ?, display_order = ?, placement_json = ?, meta_json = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(filename, nextAlt, folder, displayOrder, placementJson, JSON.stringify(meta), id)
      .run();
  } catch (err) {
    if (String(err?.message || err).includes("meta_json")) {
      await env.DB.prepare(
        `UPDATE media_assets
         SET filename = ?, alt_text = ?, folder = ?, display_order = ?, placement_json = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
        .bind(filename, nextAlt, folder, displayOrder, placementJson, id)
        .run();
    } else {
      throw err;
    }
  }

  const updated = await env.DB.prepare(`SELECT * FROM media_assets WHERE id = ?`).bind(id).first();
  return json({ ok: true, asset: rowToAsset(updated) });
}

export async function reorderMedia(request, env) {
  const body = await readJson(request);
  if (!body || !Array.isArray(body.items)) {
    return json({ error: "items array required" }, { status: 400 });
  }

  const albumId = Number(body.album_id || 0);
  if (albumId) {
    if (!Number.isInteger(albumId) || albumId <= 0) {
      return json({ error: "invalid album_id" }, { status: 400 });
    }
    const album = await env.DB.prepare("SELECT id FROM media_albums WHERE id = ?").bind(albumId).first();
    if (!album) return json({ error: "album not found" }, { status: 404 });
    for (const item of body.items) {
      if (!item?.id || item.position == null) continue;
      await env.DB.prepare(
        "UPDATE media_album_assets SET position = ? WHERE album_id = ? AND media_asset_id = ?"
      ).bind(Math.max(0, Math.round(Number(item.position))), albumId, item.id).run();
    }
    await env.DB.prepare("UPDATE media_albums SET updated_at = datetime('now') WHERE id = ?")
      .bind(albumId).run();
    return json({ ok: true, album_id: albumId, reordered: body.items.length });
  }

  for (const item of body.items) {
    if (!item?.id) continue;
    const folder = item.folder != null ? normalizeFolder(item.folder) : undefined;
    if (folder != null && item.display_order != null) {
      await env.DB.prepare(
        `UPDATE media_assets SET folder = ?, display_order = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(folder, Math.round(Number(item.display_order)), item.id)
        .run();
    } else if (folder != null) {
      await env.DB.prepare(
        `UPDATE media_assets SET folder = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(folder, item.id)
        .run();
    } else if (item.display_order != null) {
      await env.DB.prepare(
        `UPDATE media_assets SET display_order = ?, updated_at = datetime('now') WHERE id = ?`
      )
        .bind(Math.round(Number(item.display_order)), item.id)
        .run();
    }
  }

  return json({ ok: true, counts: await folderCounts(env) });
}

export async function deleteMedia(request, env, id) {
  const asset = await env.DB.prepare(`SELECT r2_key FROM media_assets WHERE id = ?`).bind(id).first();
  if (!asset) return json({ error: "Not found" }, { status: 404 });

  await env.DB.prepare(`DELETE FROM product_images WHERE media_asset_id = ?`).bind(id).run();
  await env.WEBSITE_ASSETS.delete(asset.r2_key);
  await env.DB.prepare(`DELETE FROM media_assets WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

export async function platformBindings(env) {
  return json({
    ok: true,
    bindings: {
      d1: !!env.DB,
      r2: !!env.WEBSITE_ASSETS,
      kv: !!env.CMS_CACHE,
      workers_ai: !!env.AGENTSAM_WAI,
      assets: !!env.ASSETS,
    },
    note: "Admin CRUD uses Worker bindings (D1/R2/KV/AI) — no separate API keys at runtime.",
  });
}

// ----- Product <-> image associations -----

export async function listProductImages(request, env, productId) {
  const { results } = await env.DB.prepare(
    `SELECT pi.id AS link_id, pi.position, pi.is_primary, m.*
     FROM product_images pi
     JOIN media_assets m ON m.id = pi.media_asset_id
     WHERE pi.product_id = ?
     ORDER BY pi.is_primary DESC, pi.position ASC`
  )
    .bind(productId)
    .all();
  return json({ ok: true, images: results });
}

export async function attachProductImage(request, env, productId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.media_asset_id) return json({ error: "media_asset_id required" }, { status: 400 });

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM product_images WHERE product_id = ?`
  )
    .bind(productId)
    .first();
  const isFirst = countRow.n === 0;

  try {
    await env.DB.prepare(
      `INSERT INTO product_images (product_id, media_asset_id, position, is_primary)
       VALUES (?, ?, ?, ?)`
    )
      .bind(productId, body.media_asset_id, countRow.n, isFirst ? 1 : 0)
      .run();
  } catch {
    return json({ error: "Image already attached to this product" }, { status: 400 });
  }

  if (isFirst) {
    const asset = await env.DB.prepare(`SELECT url FROM media_assets WHERE id = ?`)
      .bind(body.media_asset_id)
      .first();
    if (asset) {
      await env.DB.prepare(`UPDATE products SET image_url = ? WHERE id = ?`)
        .bind(asset.url, productId)
        .run();
    }
  }

  return json({ ok: true });
}

export async function detachProductImage(request, env, productId, mediaAssetId) {
  await env.DB.prepare(
    `DELETE FROM product_images WHERE product_id = ? AND media_asset_id = ?`
  )
    .bind(productId, mediaAssetId)
    .run();
  return json({ ok: true });
}

export async function setPrimaryProductImage(request, env, productId, mediaAssetId) {
  await env.DB.prepare(`UPDATE product_images SET is_primary = 0 WHERE product_id = ?`)
    .bind(productId)
    .run();
  await env.DB.prepare(
    `UPDATE product_images SET is_primary = 1 WHERE product_id = ? AND media_asset_id = ?`
  )
    .bind(productId, mediaAssetId)
    .run();

  const asset = await env.DB.prepare(`SELECT url FROM media_assets WHERE id = ?`)
    .bind(mediaAssetId)
    .first();
  if (asset) {
    await env.DB.prepare(`UPDATE products SET image_url = ? WHERE id = ?`)
      .bind(asset.url, productId)
      .run();
  }

  return json({ ok: true });
}
