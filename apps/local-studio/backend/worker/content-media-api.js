const IAM_ORIGIN = "https://inneranimalmedia.com";
const MAX_PAGE_SIZE = 100;
const ALLOWED_FORWARD_HEADERS = [
  "cookie",
  "authorization",
  "origin",
  "referer",
  "user-agent",
  "accept",
  "accept-language",
  "x-csrf-token",
  "x-requested-with",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safePage(value, fallback = 1) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10000) : fallback;
}

function safePageSize(value) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_PAGE_SIZE) : 48;
}

function isFile(value) {
  return !!value && typeof value.name === "string" && typeof value.arrayBuffer === "function";
}

function parseArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
  } catch {}
  return value.split(",").map((v) => v.trim()).filter(Boolean);
}

function normalizeImageAsset(item) {
  const source = item && typeof item === "object" ? item : {};
  const meta = source.meta && typeof source.meta === "object"
    ? source.meta
    : source.metadata && typeof source.metadata === "object"
      ? source.metadata
      : {};
  const mime = String(source.mime_type || source.content_type || source.mimeType || meta.mime_type || "image/jpeg");
  const size = Number(source.size_bytes ?? source.size ?? meta.size_bytes ?? 0) || 0;
  const src = source.url || source.delivery_url || source.thumbnail_url || source.thumbnail || "";
  const bucket = source.r2_bucket || meta.r2_bucket || null;
  const tags = parseArray(source.tags ?? meta.tags);
  return {
    ...source,
    id: String(source.id || source.cloudflare_image_id || source.uid || ""),
    filename: String(source.filename || source.original_filename || source.name || source.id || "Untitled asset"),
    original_filename: source.original_filename || source.filename || source.name || "",
    content_type: mime,
    mime_type: mime,
    size_bytes: size,
    size,
    width: source.width == null ? null : Number(source.width),
    height: source.height == null ? null : Number(source.height),
    url: src,
    delivery_url: source.delivery_url || src,
    thumbnail_url: source.thumbnail_url || source.thumbnail || src,
    r2_key: source.r2_key || null,
    r2_bucket: bucket,
    cloudflare_image_id: source.cloudflare_image_id || null,
    category: source.category || meta.category || "",
    folder: source.folder || meta.folder || (mime.startsWith("video/") ? "videos" : "images"),
    tags,
    alt_text: source.alt_text || meta.alt_text || "",
    description: source.description || meta.description || "",
    status: source.status || "ready",
    created_at: source.created_at || source.uploaded_at || source.created || "",
    updated_at: source.updated_at || "",
    source: source.source || (source.cloudflare_image_id ? "cf_images" : source.r2_key ? "r2" : "all"),
    meta: { ...meta, r2_bucket: bucket },
    workspace_id: source.workspace_id || null,
    tenant_id: source.tenant_id || null,
  };
}

function normalizeStreamAsset(video) {
  const source = video && typeof video === "object" ? video : {};
  const uid = String(source.uid || source.id || "");
  const thumbnail = source.thumbnail || source.thumbnail_url || "";
  const hls = source.hls || source.playback?.hls || "";
  const duration = Number(source.duration_sec ?? source.duration ?? 0);
  return {
    id: "stream_" + uid,
    filename: String(source.name || source.meta?.name || source.meta?.filename || uid || "Untitled video"),
    original_filename: String(source.name || source.meta?.name || source.meta?.filename || ""),
    content_type: "video/mp4",
    mime_type: "video/mp4",
    size_bytes: Number(source.size_bytes || source.size || 0) || 0,
    size: Number(source.size_bytes || source.size || 0) || 0,
    duration_ms: duration > 0 ? Math.round(duration * 1000) : null,
    width: null,
    height: null,
    url: hls || thumbnail,
    delivery_url: thumbnail || hls,
    thumbnail_url: thumbnail,
    r2_key: null,
    r2_bucket: null,
    cloudflare_image_id: null,
    cloudflare_stream_uid: uid,
    category: "video",
    folder: "videos",
    tags: [],
    alt_text: "",
    description: "",
    status: source.status || (source.ready ? "ready" : "processing"),
    created_at: source.created || source.created_at || "",
    updated_at: "",
    source: "stream",
    meta: {
      uid,
      hls,
      dash: source.dash || "",
      watch_url: source.watch_url || "",
      iframe_url: source.iframe_url || "",
      customer_subdomain: source.customer_subdomain || "",
      ready: !!source.ready,
      require_signed_urls: !!source.require_signed_urls,
      cloudflare_account_id: source.cloudflare_account_id || source.account_id || null,
      url_error: source.url_error || null,
    },
    workspace_id: source.workspace_id || null,
    tenant_id: source.tenant_id || null,
  };
}

function addScopeQuery(target, incomingUrl) {
  for (const key of ["workspace_id", "tenant_id"]) {
    const value = incomingUrl.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return target;
}

function forwardHeaders(request, body) {
  const headers = new Headers();
  for (const key of ALLOWED_FORWARD_HEADERS) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (!isForm) {
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    if (typeof body === "string" && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  }
  return headers;
}

function mediaProviderPreference(url) {
  const raw = String(url.searchParams.get("provider") || "").toLowerCase();
  if (raw === "iam" || raw === "inneranimalmedia") return "iam";
  if (raw === "cloudflare" || raw === "cf" || raw === "oauth") return "cloudflare";
  return "auto";
}

async function listViaCloudflareOauth(env, ownerId, url, { source, page, pageSize, query }) {
  const { createCloudflareApiClient } = await import("../../../../packages/connectors/cfoa/src/api-client.js");
  const {
    listCloudflareR2Buckets,
    listCloudflareR2Objects,
    listCloudflareImages,
    listCloudflareStream,
  } = await import("../../../../packages/connectors/cfoa/src/families/media.js");
  const connectionId = String(url.searchParams.get("connection_id") || url.searchParams.get("account_id") || "").trim();

  // Test hook: inject a ready client so gallery regression can run without IAM_API.
  let client = env?.__agentsamTestCfClient || null;
  if (!client) {
    try {
      client = await createCloudflareApiClient({
        env,
        ownerId,
        authMode: "oauth",
        capabilityId: source === "stream" ? "cloudflare.stream" : source === "r2" ? "cloudflare.r2" : "cloudflare.images",
        connectionId: connectionId || undefined,
        accountId: connectionId || undefined,
      });
    } catch (err) {
      return {
        ok: false,
        error: err?.code || err?.message || "cloudflare_oauth_required",
        status: err?.code === "cloudflare_account_selection_required" ? 409
          : err?.code === "cloudflare_reconnect_required" ? 401
            : 401,
        accounts: err?.accounts || undefined,
        connect_url: "/api/connections/cloudflare/start?packs=media,data&return_to=/media",
      };
    }
  }
  if (!client?.accountId) {
    return {
      ok: false,
      error: "cloudflare_account_selection_required",
      status: 409,
      connect_url: "/api/connections/cloudflare/start?packs=media,data&return_to=/media",
    };
  }

  const markOauth = (shape, extra = {}) => {
    shape.capabilities = { ...shape.capabilities, provider_api: "cloudflare_oauth", ...extra.capabilities };
    shape.account = {
      id: client.accountId,
      connection_id: client.connectionId || null,
      auth_source: client.authSource || "oauth",
    };
    if (extra.pagination) {
      shape.pagination = { ...shape.pagination, ...extra.pagination };
    }
    return { ok: true, shape };
  };

  if (source === "r2") {
    const bucketName = String(url.searchParams.get("r2_bucket") || "").trim();
    const bucketsPage = await listCloudflareR2Buckets(client, {
      cursor: url.searchParams.get("cursor") || undefined,
      perPage: 50,
    });
    if (!bucketName) {
      return markOauth(listResponseShape({
        assets: [],
        page,
        pageSize,
        total: 0,
        source: "r2",
        r2Buckets: bucketsPage.buckets.map((b) => ({ name: b.name, bucket_name: b.name })),
      }), {
        pagination: {
          has_next: Boolean(bucketsPage.truncated),
          cursor: bucketsPage.cursor || null,
          truncated: Boolean(bucketsPage.truncated),
        },
      });
    }
    const objects = await listCloudflareR2Objects(client, bucketName, {
      cursor: url.searchParams.get("cursor") || undefined,
      perPage: pageSize,
      prefix: url.searchParams.get("r2_prefix") || undefined,
    });
    let assets = objects.objects.map((obj) => normalizeImageAsset({
      id: `r2:${bucketName}:${obj.key}`,
      filename: obj.key.split("/").pop() || obj.key,
      mime_type: obj.http_metadata?.contentType || "application/octet-stream",
      size_bytes: obj.size,
      r2_key: obj.key,
      r2_bucket: bucketName,
      source: "r2",
      updated_at: obj.uploaded,
      meta: { cloudflare_account_id: client.accountId },
    }));
    if (query) {
      const q = query.toLowerCase();
      assets = assets.filter((asset) => (asset.filename + " " + asset.id).toLowerCase().includes(q));
    }
    return markOauth(listResponseShape({
      assets,
      page,
      pageSize,
      total: objects.truncated ? page * pageSize + assets.length : assets.length,
      source: "r2",
      r2Buckets: bucketsPage.buckets.map((b) => ({ name: b.name, bucket_name: b.name })),
      r2Bucket: bucketName,
    }), {
      pagination: {
        has_next: Boolean(objects.truncated),
        cursor: objects.cursor || null,
        truncated: Boolean(objects.truncated),
      },
    });
  }

  if (source === "stream") {
    const pageData = await listCloudflareStream(client, {
      perPage: pageSize,
      after: url.searchParams.get("cursor") || url.searchParams.get("after") || undefined,
      search: query || undefined,
    });
    let assets = pageData.videos.map((video) => normalizeStreamAsset({
      ...video,
      cloudflare_account_id: client.accountId,
    }));
    if (query) {
      const q = query.toLowerCase();
      assets = assets.filter((asset) => (asset.filename + " " + asset.id).toLowerCase().includes(q));
    }
    return markOauth(listResponseShape({
      assets,
      page,
      pageSize,
      total: pageData.count,
      source: "stream",
    }), {
      pagination: {
        has_next: Boolean(pageData.truncated),
        cursor: pageData.cursor || null,
        truncated: Boolean(pageData.truncated),
      },
    });
  }

  // Images default — also used for source=all overview (Images first; R2 via bucket chrome).
  const pageData = await listCloudflareImages(client, {
    perPage: pageSize,
    page,
    continuationToken: url.searchParams.get("cursor") || url.searchParams.get("continuation_token") || undefined,
    search: query || undefined,
  });
  const assets = pageData.images.map((img) => normalizeImageAsset({
    id: img.id,
    filename: img.filename,
    mime_type: "image/jpeg",
    size_bytes: img.size || 0,
    url: img.variant_url || "",
    delivery_url: img.variant_url || "",
    thumbnail_url: img.variant_url || "",
    cloudflare_image_id: img.id,
    source: "cf_images",
    created_at: img.uploaded,
    meta: {
      ...img.meta,
      cloudflare_account_id: client.accountId,
      delivery_hash: pageData.delivery_hash,
      variants: img.variants,
    },
  }));
  return markOauth(listResponseShape({
    assets,
    page: pageData.page || page,
    pageSize,
    total: pageData.count,
    source: "cf_images",
  }), {
    pagination: {
      has_next: Boolean(pageData.truncated),
      cursor: pageData.continuation_token || null,
      truncated: Boolean(pageData.truncated),
    },
  });
}

async function callIam(env, request, path, options = {}) {
  if (!env?.IAM_API || typeof env.IAM_API.fetch !== "function") {
    return json({ ok: false, error: "iam_media_provider_unavailable" }, 503);
  }
  const method = String(options.method || request.method || "GET").toUpperCase();
  let body;
  if (Object.prototype.hasOwnProperty.call(options, "body")) {
    body = options.body;
  } else if (!["GET", "HEAD"].includes(method) && request.body) {
    body = await request.clone().arrayBuffer();
  }
  const headers = forwardHeaders(request, body);
  if (options.headers) {
    for (const [key, value] of Object.entries(options.headers)) {
      if (value != null) headers.set(key, String(value));
    }
  }
  const target = new URL(path, IAM_ORIGIN);
  const init = { method, headers };
  if (!["GET", "HEAD"].includes(method) && body != null) init.body = body;
  return env.IAM_API.fetch(new Request(target.toString(), init));
}

async function readJson(response) {
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: "iam_provider_returned_non_json" };
  }
  return { response, data };
}

function listResponseShape({ assets, page, pageSize, total, source, r2Buckets = [], r2Bucket = null, recovery = null }) {
  const pages = total > 0 ? Math.ceil(total / pageSize) : 0;
  return {
    ok: true,
    assets,
    total,
    page,
    page_size: pageSize,
    per_page: pageSize,
    pages,
    pagination: {
      page,
      page_size: pageSize,
      total,
      pages,
      has_prev: page > 1,
      has_next: page * pageSize < total,
    },
    counts: {
      images: source === "stream" ? 0 : total,
      videos: source === "stream" ? total : 0,
      products: source === "products" ? total : 0,
    },
    source,
    r2_buckets: r2Buckets,
    r2_bucket: r2Bucket,
    albums: [],
    collections_supported: false,
    capabilities: {
      provider_api: "iam",
      can_upload_images: true,
      can_upload_videos: true,
      can_edit_metadata: true,
      can_delete: true,
      can_remove_background: false,
      can_materialize_derivatives: false,
      can_create_collections: false,
    },
    recovery,
  };
}

async function recoverDrafts(env, request, url) {
  const target = addScopeQuery(new URL("/api/images/recover-drafts", IAM_ORIGIN), url);
  const result = await readJson(await callIam(env, request, target.pathname + target.search, {
    method: "POST",
    body: "{}",
    headers: { "content-type": "application/json" },
  }));
  if (!result.response.ok || result.data?.ok === false) {
    return {
      ok: false,
      error: result.data?.error || "recovery_failed",
      status: result.response.status,
    };
  }
  return result.data;
}

async function listMedia(env, request, url, principal = null) {
  const source = String(url.searchParams.get("source") || "all").toLowerCase();
  const folder = String(url.searchParams.get("folder") || "").toLowerCase();
  const kind = String(url.searchParams.get("kind") || "all").toLowerCase();
  const page = safePage(url.searchParams.get("page"), 1);
  const pageSize = safePageSize(url.searchParams.get("page_size") || url.searchParams.get("per_page"));
  const query = String(url.searchParams.get("q") || "").trim();
  const providerPref = mediaProviderPreference(url);
  let recovery = null;

  // User Cloudflare media is the default. IAM is only used when provider=iam (explicit).
  // Never require IAM_API for user-owned CF Images / Stream / R2 gallery browsing (#419).
  const iamAvailable = Boolean(env?.IAM_API && typeof env.IAM_API.fetch === "function");
  if (providerPref !== "iam") {
    if (!principal?.id) {
      return json({ ok: false, error: "authentication_required" }, 401);
    }
    try {
      const oauthSource = source === "all"
        ? (kind === "video" || folder === "videos" ? "stream" : source === "r2" ? "r2" : "cf_images")
        : source;
      const oauth = await listViaCloudflareOauth(env, principal.id, url, {
        source: oauthSource === "drive" ? "cf_images" : (oauthSource === "all" ? "cf_images" : oauthSource),
        page,
        pageSize,
        query,
      });
      if (oauth.ok && oauth.shape) {
        if (recovery) oauth.shape.recovery = recovery;
        return json(oauth.shape);
      }
      return json({
        ok: false,
        error: oauth.error || "cloudflare_media_list_failed",
        message: "Connect or re-authorize Cloudflare OAuth to browse your Images, Stream, and R2 media. IAM is optional and only used when provider=iam.",
        accounts: oauth.accounts,
        connect_url: oauth.connect_url || "/api/connections/cloudflare/start?packs=media,data&return_to=/media",
      }, oauth.status || 502);
    } catch (err) {
      return json({
        ok: false,
        error: err?.code || err?.message || "cloudflare_media_list_failed",
        accounts: err?.accounts,
        connect_url: "/api/connections/cloudflare/start?packs=media,data&return_to=/media",
      }, err?.code === "cloudflare_account_selection_required" ? 409 : 502);
    }
  }

  if (!iamAvailable) {
    return json({
      ok: false,
      error: "iam_media_provider_unavailable",
      message: "InnerAnimalMedia (IAM) provider was selected but IAM_API is not bound. Use Cloudflare OAuth (default) instead.",
      connect_url: "/api/connections/cloudflare/start?packs=media,data&return_to=/media",
    }, 503);
  }

  if (url.searchParams.get("sync") === "1") {
    recovery = await recoverDrafts(env, request, url);
  }

  const wantsStream = source === "stream" || (source === "all" && (kind === "video" || folder === "videos"));
  if (wantsStream) {
    const target = addScopeQuery(new URL("/api/stream/videos", IAM_ORIGIN), url);
    target.searchParams.set("limit", String(MAX_PAGE_SIZE));
    const result = await readJson(await callIam(env, request, target.pathname + target.search));
    if (!result.response.ok) {
      return json({ ok: false, error: result.data?.error || "stream_list_failed" }, result.response.status);
    }
    const raw = Array.isArray(result.data?.videos) ? result.data.videos : Array.isArray(result.data?.items) ? result.data.items : [];
    let assets = raw.map(normalizeStreamAsset);
    if (query) {
      const q = query.toLowerCase();
      assets = assets.filter((asset) => (asset.filename + " " + asset.id).toLowerCase().includes(q));
    }
    const total = Number(result.data?.total ?? assets.length) || 0;
    const start = (page - 1) * pageSize;
    const pageAssets = assets.slice(start, start + pageSize);
    return json(listResponseShape({
      assets: pageAssets,
      page,
      pageSize,
      total,
      source: "stream",
      recovery,
    }));
  }

  const allowedSources = new Set(["all", "cf_images", "r2", "drive"]);
  const iamSource = allowedSources.has(source) ? source : "all";
  const target = addScopeQuery(new URL("/api/images", IAM_ORIGIN), url);
  target.searchParams.set("source", iamSource);
  target.searchParams.set("page", String(page));
  target.searchParams.set("per_page", String(pageSize));
  for (const key of ["q", "tag", "project_id", "r2_bucket", "r2_prefix", "category"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  if (folder === "products" && !target.searchParams.has("category")) {
    target.searchParams.set("category", "product");
  }

  const result = await readJson(await callIam(env, request, target.pathname + target.search));
  const data = result.data || {};
  const bucketList = Array.isArray(data.r2_buckets) ? data.r2_buckets.map((bucket) => ({
    ...bucket,
    name: bucket.name || bucket.bucket_name || bucket.binding || "",
    bucket_name: bucket.bucket_name || bucket.name || bucket.binding || "",
  })) : [];
  if (!result.response.ok && data.error !== "r2_selection_required" && !data.r2_selection_required) {
    return json({ ok: false, error: data.error || "image_list_failed" }, result.response.status);
  }
  const raw = Array.isArray(data.items) ? data.items : Array.isArray(data.images) ? data.images : [];
  let assets = raw.map(normalizeImageAsset);
  if (kind === "video") assets = assets.filter((asset) => asset.content_type.startsWith("video/"));
  if (kind === "image") assets = assets.filter((asset) => asset.content_type.startsWith("image/"));
  const total = Number(data.total ?? assets.length) || 0;

  return json(listResponseShape({
    assets,
    page,
    pageSize,
    total,
    source: iamSource,
    r2Buckets: bucketList,
    r2Bucket: data.r2_bucket || url.searchParams.get("r2_bucket") || null,
    recovery,
  }));
}

async function uploadMedia(env, request, url) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "multipart_form_required" }, 400);
  }

  const files = [...form.getAll("files"), ...form.getAll("file")].filter(isFile);
  if (!files.length) return json({ ok: false, error: "no_files_provided" }, 400);
  const videoFiles = files.filter((file) => String(file.type || "").startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name));
  if (videoFiles.length) {
    return json({
      ok: false,
      error: "video_upload_requires_stream_direct_upload",
      endpoint: "/api/admin/media/stream/direct-upload",
    }, 400);
  }

  const role = String(form.get("derivative_role") || "").toLowerCase();
  const policy = String(form.get("transform_policy") || "").toLowerCase();
  const preserveOriginal = role === "original" || role === "master" || policy === "preserve";
  const bucket = String(form.get("r2_bucket") || "inneranimalmedia").trim();
  const folder = String(form.get("folder") || "").trim();
  const baseTags = parseArray(form.get("tags"));
  const sourceMediaAssetId = String(form.get("source_media_asset_id") || "").trim();
  if (folder && folder !== "images" && folder !== "videos" && !baseTags.includes(folder)) baseTags.push(folder);
  if (sourceMediaAssetId && !baseTags.includes("derived")) baseTags.push("derived");
  const altText = String(form.get("alt_text") || "").trim();

  const assets = [];
  const errors = [];
  for (const file of files) {
    const isModelFile = /\.(glb|gltf|usdz)$/i.test(String(file.name || "")) || String(file.type || "").startsWith("model/");
    const useR2 = preserveOriginal || isModelFile || !String(file.type || "").startsWith("image/");
    const fileTags = [...baseTags];
    if (isModelFile && !fileTags.includes("3d")) fileTags.push("3d");
    const itemForm = new FormData();
    itemForm.set("file", file, file.name);
    if (altText) itemForm.set("alt_text", altText);
    if (fileTags.length) itemForm.set("tags", JSON.stringify(fileTags));
    if (useR2) itemForm.set("r2_bucket", bucket);

    const path = useR2 ? "/api/images/upload?destination=r2" : "/api/images/upload";
    const result = await readJson(await callIam(env, request, path, {
      method: "POST",
      body: itemForm,
    }));
    if (!result.response.ok || result.data?.ok === false) {
      errors.push({
        filename: file.name,
        error: result.data?.error || "upload_failed",
        status: result.response.status,
      });
      continue;
    }
    const item = result.data?.item || result.data?.image || result.data?.asset || result.data;
    assets.push(normalizeImageAsset(item));
  }

  if (errors.length && !assets.length) {
    return json({ ok: false, error: errors[0].error, errors, assets: [] }, errors[0].status || 502);
  }
  return json({
    ok: errors.length === 0,
    partial: errors.length > 0,
    assets,
    errors,
    uploaded_count: assets.length,
    failed_count: errors.length,
    original_preserved: preserveOriginal,
  }, errors.length ? 207 : 200);
}

async function batchMedia(env, request, url) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || body.operation || "").toLowerCase();
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)).filter(Boolean) : [];
  if (!ids.length) return json({ ok: false, error: "ids_required" }, 400);

  if (action === "delete") {
    const results = [];
    for (const id of ids) {
      const isStream = id.startsWith("stream_");
      const upstreamPath = isStream
        ? "/api/stream/videos/" + encodeURIComponent(id.slice("stream_".length))
        : "/api/images/" + encodeURIComponent(id);
      const result = await readJson(await callIam(env, request, upstreamPath, { method: "DELETE" }));
      results.push({ id, ok: result.response.ok && result.data?.ok !== false, error: result.data?.error || null });
    }
    const failed = results.filter((item) => !item.ok);
    return json({ ok: failed.length === 0, deleted_count: results.length - failed.length, failed_count: failed.length, results }, failed.length ? 207 : 200);
  }

  if (action === "move") {
    const folder = String(body.folder || body.destination || "").trim().toLowerCase();
    if (!folder) return json({ ok: false, error: "folder_required" }, 400);
    const results = [];
    for (const id of ids) {
      if (id.startsWith("stream_")) {
        results.push({ id, ok: folder === "videos", error: folder === "videos" ? null : "stream_assets_cannot_move_to_image_folders" });
        continue;
      }
      if (folder === "videos") {
        results.push({ id, ok: false, error: "image_assets_cannot_be_moved_to_stream" });
        continue;
      }
      const category = folder === "images" ? null : folder === "products" ? "product" : folder;
      const result = await readJson(await callIam(env, request, "/api/images/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({ category }),
        headers: { "content-type": "application/json" },
      }));
      results.push({ id, ok: result.response.ok && result.data?.ok !== false, error: result.data?.error || null });
    }
    const failed = results.filter((item) => !item.ok);
    return json({ ok: failed.length === 0, updated_count: results.length - failed.length, failed_count: failed.length, results }, failed.length ? 207 : 200);
  }

  if (action === "tag_add" || action === "tag_remove" || action === "tags") {
    const tagsToChange = parseArray(body.tags || body.tag);
    if (!tagsToChange.length) return json({ ok: false, error: "tag_required" }, 400);
    const results = [];
    for (const id of ids) {
      if (id.startsWith("stream_")) {
        results.push({ id, ok: false, error: "stream_tags_not_supported" });
        continue;
      }
      const detail = await readJson(await callIam(env, request, "/api/images/" + encodeURIComponent(id)));
      if (!detail.response.ok) {
        results.push({ id, ok: false, error: detail.data?.error || "asset_read_failed" });
        continue;
      }
      const currentItem = detail.data?.item || detail.data?.image || detail.data?.asset || detail.data;
      const currentTags = parseArray(currentItem?.tags);
      const nextTags = action === "tag_remove"
        ? currentTags.filter((tag) => !tagsToChange.includes(tag))
        : [...new Set([...currentTags, ...tagsToChange])];
      const result = await readJson(await callIam(env, request, "/api/images/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({ tags: nextTags }),
        headers: { "content-type": "application/json" },
      }));
      results.push({ id, ok: result.response.ok && result.data?.ok !== false, error: result.data?.error || null });
    }
    const failed = results.filter((item) => !item.ok);
    return json({ ok: failed.length === 0, updated_count: results.length - failed.length, failed_count: failed.length, results }, failed.length ? 207 : 200);
  }

  return json({ ok: false, error: "batch_action_not_supported_by_iam_provider_adapter", action }, 409);
}

async function proxyAssetRequest(env, request, url, assetId, suffix = "") {
  const id = String(assetId || "");
  const isStream = id.startsWith("stream_");
  const cleanId = isStream ? id.slice("stream_".length) : id;
  let path = isStream
    ? "/api/stream/videos/" + encodeURIComponent(cleanId)
    : "/api/images/" + encodeURIComponent(cleanId);
  if (suffix) {
    if (isStream) return json({ ok: false, error: "stream_subroute_not_supported" }, 409);
    path += "/" + suffix.split("/").map(encodeURIComponent).join("/");
  }
  const target = addScopeQuery(new URL(path, IAM_ORIGIN), url);
  for (const key of ["r2_bucket", "r2_key"]) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  const response = await callIam(env, request, target.pathname + target.search);
  if (request.method === "GET") {
    const result = await readJson(response);
    if (!result.response.ok) return json({ ok: false, error: result.data?.error || "asset_request_failed" }, result.response.status);
    const data = result.data || {};
    if (isStream) {
      const video = data.video || data.item || data;
      return json({ ...data, asset: normalizeStreamAsset(video), video });
    }
    const item = data.item || data.image || data.asset || data;
    return json({ ...data, asset: normalizeImageAsset(item), item });
  }
  return response;
}

export async function handleStudioContentMediaApi(request, env, principal, url = new URL(request.url)) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/api/admin/media")) return null;
  if (!principal?.id) return json({ ok: false, error: "authentication_required" }, 401);

  if (path === "/api/admin/media/image-models") return null;

  if (path === "/api/admin/media" && request.method === "GET") {
    return listMedia(env, request, url, principal);
  }
  if (path === "/api/admin/media" && request.method === "POST") {
    return uploadMedia(env, request, url);
  }
  if (path === "/api/admin/media/sync" && request.method === "POST") {
    const recovery = await recoverDrafts(env, request, url);
    return json({ ok: !!recovery?.ok, recovery, synced: true });
  }
  if (path === "/api/admin/media/stream/direct-upload" && request.method === "POST") {
    const target = addScopeQuery(new URL("/api/stream/direct-upload", IAM_ORIGIN), url);
    const response = await callIam(env, request, target.pathname + target.search, { method: "POST" });
    const result = await readJson(response);
    return json(result.data, result.response.status);
  }
  if (path === "/api/admin/media/albums" && request.method === "GET") {
    return json({ ok: true, albums: [], collections_supported: false });
  }
  if (path === "/api/admin/media/albums" || /^\/api\/admin\/media\/albums\/[^/]+$/.test(path)) {
    return json({ ok: false, error: "collections_not_yet_connected_to_canonical_media_records" }, 409);
  }
  if (path === "/api/admin/media/reorder" && request.method === "POST") {
    return json({ ok: false, error: "manual_reorder_not_supported_for_provider_assets" }, 409);
  }
  if (path === "/api/admin/media/batch" && request.method === "POST") {
    return batchMedia(env, request, url);
  }

  const resourceTagsMatch = path.match(/^\/api\/admin\/media\/([^/]+)\/resource-tags$/);
  if (resourceTagsMatch) {
    return proxyAssetRequest(env, request, url, resourceTagsMatch[1], "resource-tags");
  }

  const unsupportedMatch = path.match(/^\/api\/admin\/media\/([^/]+)\/(ai-edit|resample|remove-background|comments|gallery)$/);
  if (unsupportedMatch) {
    return json({
      ok: false,
      error: "operation_not_connected_to_iam_provider_api",
      operation: unsupportedMatch[2],
      original_asset_preserved: true,
    }, 501);
  }

  const assetMatch = path.match(/^\/api\/admin\/media\/([^/]+)$/);
  if (assetMatch && ["GET", "PATCH", "DELETE", "PUT"].includes(request.method.toUpperCase())) {
    return proxyAssetRequest(env, request, url, assetMatch[1]);
  }

  return null;
}
