/**
 * Read-only Cloudflare media discovery (R2 buckets, Images, Stream) using the
 * authenticated connector client. Never returns tokens. Does not copy assets.
 */
import { assessCapabilityAuthorization } from '../capabilities.js';

const MEDIA_CAPS = ['cloudflare.r2', 'cloudflare.images', 'cloudflare.stream'];

function emptyFamily(status = 'unavailable', error = null) {
  return {
    status,
    available: false,
    error,
    count: 0,
  };
}

function classifyHttpError(error) {
  const status = Number(error?.httpStatus || error?.status || 0);
  if (status === 401 || status === 403) return 'needs_scope';
  if (status === 404) return 'unavailable';
  return 'error';
}

/**
 * List R2 buckets for one account. Pagination only — does not scan objects.
 * @param {import('../api-client.js').CloudflareApiClient} client
 * @param {{ cursor?: string, perPage?: number, nameContains?: string }} [opts]
 */
export async function listCloudflareR2Buckets(client, opts = {}) {
  client.requireAccount('cloudflare.r2.buckets.list');
  const params = new URLSearchParams();
  const perPage = Math.min(Math.max(Number(opts.perPage) || 50, 1), 50);
  params.set('per_page', String(perPage));
  if (opts.cursor) params.set('cursor', String(opts.cursor));
  if (opts.nameContains) params.set('name_contains', String(opts.nameContains));
  const res = await client.request(
    'GET',
    client.accountPath(`/r2/buckets?${params}`),
    { operation: 'cloudflare.r2.buckets.list', capabilityId: 'cloudflare.r2' },
  );
  const buckets = Array.isArray(res?.result?.buckets)
    ? res.result.buckets
    : Array.isArray(res?.result)
      ? res.result
      : [];
  const info = res?.result_info || {};
  return {
    buckets: buckets.map((row) => ({
      name: String(row.name || row.id || ''),
      creation_date: row.creation_date || row.created_on || null,
      location: row.location || row.jurisdiction || null,
      storage_class: row.storage_class || null,
    })).filter((b) => b.name),
    cursor: info.cursor || info.cursors?.after || null,
    truncated: Boolean(
      info.truncated
      ?? info.is_truncated
      ?? info.cursors?.after
      ?? false,
    ),
    count: Number(info.count ?? buckets.length) || buckets.length,
  };
}

/**
 * List objects in one R2 bucket (cursor page). Does not recurse every bucket.
 * @param {import('../api-client.js').CloudflareApiClient} client
 * @param {string} bucketName
 * @param {{ cursor?: string, perPage?: number, prefix?: string }} [opts]
 */
export async function listCloudflareR2Objects(client, bucketName, opts = {}) {
  const name = String(bucketName || '').trim();
  if (!name) {
    const err = new Error('r2_bucket_required');
    err.code = 'r2_bucket_required';
    throw err;
  }
  client.requireAccount('cloudflare.r2.objects.list');
  const params = new URLSearchParams();
  const perPage = Math.min(Math.max(Number(opts.perPage) || 100, 1), 1000);
  params.set('per_page', String(perPage));
  if (opts.cursor) params.set('cursor', String(opts.cursor));
  if (opts.prefix) params.set('prefix', String(opts.prefix));
  const res = await client.request(
    'GET',
    client.accountPath(`/r2/buckets/${encodeURIComponent(name)}/objects?${params}`),
    { operation: 'cloudflare.r2.objects.list', capabilityId: 'cloudflare.r2' },
  );
  const objects = Array.isArray(res?.result) ? res.result : [];
  const info = res?.result_info || {};
  return {
    bucket: name,
    objects: objects.map((row) => ({
      key: String(row.key || row.name || ''),
      size: Number(row.size || 0) || 0,
      etag: row.etag || null,
      http_metadata: row.httpMetadata || row.http_metadata || null,
      uploaded: row.uploaded || row.last_modified || null,
      storage_class: row.storage_class || null,
    })).filter((o) => o.key),
    cursor: info.cursor || info.cursors?.after || null,
    truncated: Boolean(
      info.truncated
      ?? info.is_truncated
      ?? info.cursor
      ?? info.cursors?.after
      ?? false,
    ),
  };
}

/**
 * Paginated Cloudflare Images gallery (user OAuth). Not a probe.
 * @param {import('../api-client.js').CloudflareApiClient} client
 * @param {{ perPage?: number, page?: number, continuationToken?: string, search?: string }} [opts]
 */
export async function listCloudflareImages(client, opts = {}) {
  client.requireAccount('cloudflare.images.list');
  const perPage = Math.min(Math.max(Number(opts.perPage) || 48, 1), 100);
  const params = new URLSearchParams({ per_page: String(perPage) });
  if (opts.page) params.set('page', String(opts.page));
  if (opts.continuationToken) params.set('continuation_token', String(opts.continuationToken));
  if (opts.search) params.set('search', String(opts.search));
  const res = await client.request(
    'GET',
    client.accountPath(`/images/v2?${params}`),
    { operation: 'cloudflare.images.list', capabilityId: 'cloudflare.images' },
  );
  const images = Array.isArray(res?.result?.images) ? res.result.images : [];
  const info = res?.result_info || {};
  let deliveryHash = null;
  const mapped = images.map((img) => {
    const variants = Array.isArray(img.variants) ? img.variants : [];
    const variantUrl = variants[0] || img.variant || null;
    if (!deliveryHash && typeof variantUrl === 'string') {
      const match = variantUrl.match(/imagedelivery\.net\/([^/]+)\//i);
      if (match) deliveryHash = match[1];
    }
    return {
      id: String(img.id || ''),
      filename: String(img.filename || img.id || 'image'),
      size: Number(img.size || 0) || 0,
      uploaded: img.uploaded || img.created || null,
      requireSignedURLs: Boolean(img.requireSignedURLs),
      variants,
      variant_url: typeof variantUrl === 'string' ? variantUrl : null,
      meta: img.meta && typeof img.meta === 'object' ? img.meta : {},
    };
  }).filter((row) => row.id);
  return {
    images: mapped,
    delivery_hash: deliveryHash,
    count: Number(info.total_count ?? info.count ?? mapped.length) || mapped.length,
    continuation_token: info.continuation_token || null,
    truncated: Boolean(
      info.continuation_token
      ?? info.truncated
      ?? info.is_truncated
      ?? false,
    ),
    page: Number(info.page || opts.page || 1) || 1,
    per_page: perPage,
  };
}

/**
 * Paginated Cloudflare Stream gallery (user OAuth). Not a probe.
 * @param {import('../api-client.js').CloudflareApiClient} client
 * @param {{ perPage?: number, after?: string, search?: string }} [opts]
 */
export async function listCloudflareStream(client, opts = {}) {
  client.requireAccount('cloudflare.stream.list');
  const perPage = Math.min(Math.max(Number(opts.perPage) || 48, 1), 1000);
  const params = new URLSearchParams({ limit: String(perPage) });
  if (opts.after) params.set('after', String(opts.after));
  if (opts.search) params.set('search', String(opts.search));
  const res = await client.request(
    'GET',
    client.accountPath(`/stream?${params}`),
    { operation: 'cloudflare.stream.list', capabilityId: 'cloudflare.stream' },
  );
  const videos = Array.isArray(res?.result) ? res.result : [];
  const info = res?.result_info || {};
  let customerCode = null;
  const mapped = videos.map((video) => {
    const uid = String(video.uid || video.id || '');
    const hls = video.playback?.hls || video.hls || '';
    if (!customerCode && typeof hls === 'string') {
      const match = hls.match(/customer-([a-z0-9]+)\.cloudflarestream\.com/i);
      if (match) customerCode = match[1];
    }
    return {
      uid,
      name: String(video.meta?.name || video.meta?.filename || video.name || uid || 'video'),
      size: Number(video.size || video.size_bytes || 0) || 0,
      duration: Number(video.duration || 0) || 0,
      thumbnail: video.thumbnail || null,
      hls: hls || null,
      dash: video.playback?.dash || video.dash || null,
      ready: Boolean(video.readyToStream ?? video.ready),
      created: video.created || video.created_at || null,
      requireSignedURLs: Boolean(video.requireSignedURLs),
      meta: video.meta && typeof video.meta === 'object' ? video.meta : {},
    };
  }).filter((row) => row.uid);
  return {
    videos: mapped,
    customer_code: customerCode,
    count: Number(info.total ?? mapped.length) || mapped.length,
    cursor: info.cursor || (mapped.length ? mapped[mapped.length - 1].uid : null),
    truncated: Boolean(info.truncated ?? info.is_truncated ?? (mapped.length >= perPage)),
    per_page: perPage,
  };
}

async function probeImages(client) {
  try {
    const page = await listCloudflareImages(client, { perPage: 1 });
    return {
      status: 'connected',
      available: true,
      error: null,
      // Probe only — do not treat sample length as account-wide total.
      count: null,
      sample_count: page.images.length,
      delivery_hash: page.delivery_hash,
      continuation_token: page.continuation_token || null,
      sample_image_id: page.images[0]?.id || null,
    };
  } catch (error) {
    return {
      ...emptyFamily(classifyHttpError(error), String(error?.message || error).slice(0, 240)),
      delivery_hash: null,
      continuation_token: null,
      sample_image_id: null,
      sample_count: 0,
    };
  }
}

async function probeStream(client) {
  try {
    const page = await listCloudflareStream(client, { perPage: 1 });
    return {
      status: 'connected',
      available: true,
      error: null,
      count: null,
      sample_count: page.videos.length,
      customer_code: page.customer_code,
      sample_uid: page.videos[0]?.uid || null,
      sample_thumbnail: page.videos[0]?.thumbnail || null,
    };
  } catch (error) {
    return {
      ...emptyFamily(classifyHttpError(error), String(error?.message || error).slice(0, 240)),
      customer_code: null,
      sample_uid: null,
      sample_thumbnail: null,
      sample_count: 0,
    };
  }
}

async function probeR2(client, opts = {}) {
  try {
    const page = await listCloudflareR2Buckets(client, {
      perPage: opts.perPage || 50,
      cursor: opts.cursor,
      nameContains: opts.nameContains,
    });
    return {
      status: page.buckets.length ? 'connected' : 'empty',
      available: true,
      error: null,
      count: page.count,
      buckets: page.buckets,
      cursor: page.cursor,
      truncated: page.truncated,
    };
  } catch (error) {
    return {
      ...emptyFamily(classifyHttpError(error), String(error?.message || error).slice(0, 240)),
      buckets: [],
      cursor: null,
      truncated: false,
    };
  }
}

/**
 * Account-wide media discovery for Settings → Connections and Media Library.
 * @param {import('../api-client.js').CloudflareApiClient} client
 * @param {{ cursor?: string, perPage?: number, nameContains?: string }} [opts]
 */
export async function discoverCloudflareMedia(client, opts = {}) {
  const scopes = Array.isArray(client?.grantedScopes) ? client.grantedScopes : [];
  const auth = MEDIA_CAPS.map((id) => assessCapabilityAuthorization(id, scopes));
  const missingScopes = [...new Set(auth.flatMap((row) => row.missing_scopes || []))];

  if (!client?.accountId) {
    return {
      ok: false,
      status: 'account_required',
      account: null,
      r2: emptyFamily('account_required'),
      images: emptyFamily('account_required'),
      stream: emptyFamily('account_required'),
      capabilities: auth,
      missing_scopes: missingScopes,
      connect_url: '/api/connections/cloudflare/start?packs=media,data&return_to=/settings/integrations',
      checked_at: new Date().toISOString(),
    };
  }

  const [r2, images, stream] = await Promise.all([
    probeR2(client, opts),
    probeImages(client),
    probeStream(client),
  ]);

  const statuses = [r2.status, images.status, stream.status];
  let status = 'connected';
  if (statuses.every((s) => s === 'needs_scope')) status = 'needs_scope';
  else if (statuses.every((s) => s === 'error' || s === 'unavailable' || s === 'needs_scope')) status = 'error';
  else if (statuses.includes('needs_scope') || statuses.includes('error')) status = 'partial';
  else if (statuses.every((s) => s === 'empty')) status = 'empty';

  return {
    ok: true,
    status,
    account: {
      id: client.accountId,
      connection_id: client.connectionId || null,
      auth_source: client.authSource || null,
    },
    r2,
    images,
    stream,
    capabilities: auth,
    missing_scopes: missingScopes,
    reconnect_url: '/api/connections/cloudflare/start?packs=media,data&return_to=/settings/integrations',
    checked_at: new Date().toISOString(),
  };
}
