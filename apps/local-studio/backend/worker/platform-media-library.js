/**
 * IAM_MAIN -> portable Ecommerce Content Library adapter.
 *
 * The AgentSam-hosted console mounts the same UI as customer stores, but
 * IAM_MAIN uses text image/asset IDs and workspace-scoped registries instead
 * of the merchant's integer media_assets/media_albums tables. Never pass
 * these queries to the merchant handler.
 *
 * Only owner-created images, owner-registered objects and active workspace
 * memberships are visible. This is deliberately a registry view: unregistered
 * Cloudflare account images and Google Drive files require a separately
 * authorized provider adapter and MUST NOT be represented as synced.
 */
const IMAGE_FILE = /\.(?:png|jpe?g|webp|gif|svg|avif|heic)$/i;
const VIDEO_FILE = /\.(?:mp4|mov|m4v|webm)$/i;
const MODEL_FILE = /\.(?:glb|gltf|usdz)$/i;

function mediaJson(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

function isMedia(mime, filename) {
  return /^(?:image|video|model)\//.test(mime || "") ||
    IMAGE_FILE.test(filename || "") || VIDEO_FILE.test(filename || "") ||
    MODEL_FILE.test(filename || "");
}

function safeMeta(source) {
  if (!source) return {};
  if (typeof source === "object") return source;
  try { return JSON.parse(source) || {}; } catch { return {}; }
}

function getKind(mime, filename) {
  if (/^video\//.test(mime || "") || VIDEO_FILE.test(filename || "")) return "video";
  if (/^model\//.test(mime || "") || MODEL_FILE.test(filename || "")) return "model";
  return "image";
}

function getFolder(kind, meta) {
  if (meta.folder === "products") return "products";
  return kind === "video" || kind === "model" ? "videos" : "images";
}

export function normalizeIamImage(row) {
  const meta = safeMeta(row.metadata);
  const kind = getKind(row.mime_type, row.filename);
  const provider = row.cloudflare_image_id ? "cf_images" : "r2";
  const url = row.url || row.thumbnail_url || null;
  return {
    id: String(row.id),
    source: {
      provider,
      key: row.r2_key || null,
      asset_id: row.cloudflare_image_id || null,
      url,
    },
    filename: row.filename || row.original_filename || String(row.id),
    r2_key: row.r2_key || null,
    url, delivery_url: url, cdn_url: url,
    content_type: row.mime_type || "image/png",
    size_bytes: Number(row.size || 0),
    alt_text: row.alt_text || "",
    status: row.status === "failed" ? "failed" : "ready",
    folder: getFolder(kind, meta),
    category: meta.category || null,
    meta: { ...meta, original_image_id: row.id, provider },
    display: {
      format: (row.mime_type || "").split("/")[1]?.toUpperCase() || "IMAGE",
      width: row.width || null,
      height: row.height || null,
      bytes: Number(row.size || 0),
    },
    created_at: new Date(Number(row.created_at || 0) * 1000).toISOString(),
    updated_at: new Date(Number(row.updated_at || row.created_at || 0) * 1000).toISOString(),
    prepared_versions: [],
    usage: [],
  };
}

export function normalizeIamMediaAsset(row) {
  const meta = safeMeta(row.metadata_json);
  const mime = row.content_type || "";
  const kind = getKind(mime, row.filename || row.object_key);
  const provider = row.source_kind === "stream" ? "cf_stream" : (row.source_kind || "r2");
  const url = /^https:\/\//.test(row.source_uri || "") ? row.source_uri : null;
  return {
    id: String(row.id),
    source: { provider, key: row.object_key, asset_id: row.stream_uid || null, url },
    filename: row.filename || row.object_key?.split("/").pop() || String(row.id),
    r2_key: provider === "r2" ? row.object_key : null,
    url, delivery_url: url, cdn_url: url,
    content_type: mime || (kind === "image" ? "image/jpeg" : "application/octet-stream"),
    size_bytes: Number(row.size_bytes || 0),
    alt_text: meta.alt_text || "",
    status: row.status === "failed" ? "failed" : row.status === "analyzing" ? "processing" : "ready",
    folder: getFolder(kind, meta),
    category: meta.category || null,
    meta: { ...meta, source_bucket: row.bucket, source_key: row.object_key, provider },
    display: {
      format: (mime.split("/")[1] || kind).toUpperCase(),
      width: row.width || null,
      height: row.height || null,
      bytes: Number(row.size_bytes || 0),
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    prepared_versions: [],
    usage: [],
  };
}

function matches(asset, { kind, source, q, status, folder }) {
  if (source !== "all" && asset.source.provider !== source) return false;
  if (kind !== "all" && getKind(asset.content_type, asset.filename) !== kind) return false;
  if (status !== "all" && asset.status !== status) return false;
  if (folder && asset.folder !== folder) return false;
  if (!q) return true;
  return [asset.filename, asset.alt_text, asset.r2_key, asset.category, asset.source.key]
    .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
}

/**
 * Worker route for AgentSam's authenticated /api/admin/media GET endpoints.
 * The user id must come from resolveSessionUser; no caller-supplied owner id.
 */
export async function handlePlatformMediaRead(request, env, url, principal) {
  const userId = String(principal?.id || "");
  if (!userId) return mediaJson({ error: "unauthorized" }, 401);
  if (!env.DB?.prepare) return mediaJson({ error: "media_registry_unavailable" }, 503);
  if (request.method !== "GET") {
    return mediaJson({ error: "media_action_not_implemented_for_platform_registry" }, 501);
  }

  const path = url.pathname;
  try {
    const [imageResult, mediaResult] = await Promise.all([
      env.DB.prepare(
        "SELECT id, filename, original_filename, mime_type, size, width, height, " +
        "r2_key, cloudflare_image_id, url, thumbnail_url, alt_text, status, metadata, created_at, updated_at " +
        "FROM images WHERE user_id = ? AND COALESCE(status,'active') != 'deleted' ORDER BY created_at DESC LIMIT 2000"
      ).bind(userId).all(),
      env.DB.prepare(
        "SELECT m.id, m.filename, m.content_type, m.size_bytes, m.width, m.height, m.object_key, " +
        "m.bucket, m.source_kind, m.source_uri, m.stream_uid, m.status, m.metadata_json, m.created_at, m.updated_at " +
        "FROM media_assets m WHERE m.created_by_user_id = ? OR EXISTS (" +
        "SELECT 1 FROM workspace_members wm WHERE wm.user_id = ? AND wm.is_active = 1 " +
        "AND wm.workspace_id = m.workspace_id) ORDER BY m.created_at DESC LIMIT 2000"
      ).bind(userId, userId).all(),
    ]);

    const indexed = new Map();
    for (const row of imageResult.results || []) {
      const item = normalizeIamImage(row);
      if (isMedia(item.content_type, item.filename)) indexed.set(item.id, item);
    }
    for (const row of mediaResult.results || []) {
      const item = normalizeIamMediaAsset(row);
      if (!isMedia(item.content_type, item.filename)) continue;
      // One source object can have both an images and media_assets registry row.
      const exists = [...indexed.values()].some((a) =>
        item.r2_key && a.r2_key === item.r2_key &&
        (a.source.provider === "cf_images" || a.source.provider === "r2")
      );
      if (!exists) indexed.set(item.id, item);
    }

    const all = [...indexed.values()];
    const detail = path.match(/^\/api\/admin\/media\/([^/]+)$/);
    if (detail) {
      const asset = indexed.get(decodeURIComponent(detail[1]));
      return asset
        ? mediaJson({ ok: true, asset, capabilities: { source_provider: "platform_registry" } })
        : mediaJson({ error: "Media asset not found" }, 404);
    }
    if (path !== "/api/admin/media") return mediaJson({ error: "unknown_media_route" }, 404);

    const kind = (url.searchParams.get("kind") || "all").toLowerCase();
    const source = (url.searchParams.get("source") || "all").toLowerCase();
    const status = (url.searchParams.get("status") || "all").toLowerCase();
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const folder = url.searchParams.get("folder") || null;
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.max(12, Math.min(100, Number.parseInt(url.searchParams.get("page_size") || "48", 10) || 48));

    const counts = { images: 0, videos: 0, products: 0 };
    for (const asset of all) counts[asset.folder] = (counts[asset.folder] || 0) + 1;
    const filtered = all.filter((asset) => matches(asset, { kind, source, q, status, folder }));
    filtered.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    return mediaJson({
      ok: true,
      assets: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
      counts,
      albums: [],
      pagination: {
        page: safePage, page_size: pageSize, total, pages,
        has_prev: safePage > 1, has_next: safePage < pages,
      },
      capabilities: {
        source_provider: "iam_registry",
        transform_provider: null,
        can_materialize_derivatives: false,
        can_remove_background: false,
        providers: [
          { id: "cf_images", mode: "registered_only" },
          { id: "r2", mode: "registered_only" },
          { id: "cf_stream", mode: "registered_only" },
          { id: "google_drive", mode: "not_connected_to_studio" },
        ],
        warning: "Platform registry view only. Live Cloudflare Images, R2 bucket browse and Google Drive require provider adapters.",
      },
    });
  } catch (error) {
    console.error("[platform-media] database query failed", error);
    return mediaJson({ error: "platform_media_query_failed" }, 500);
  }
}
