/**
 * Asset pipeline configuration.
 *
 * Pipeline defaults are code. Deployment values (bucket, account, hostnames) are not:
 * the host supplies them once at startup through configureAssetStorage() and every
 * consumer reads them through assetStorage(). Using storage before it is configured
 * throws, with the fix in the message, instead of silently pointing at someone's bucket.
 *   Worker: ensureAssetStorage(env, request)   -> ./runtime.js (company domain + bindings)
 *   CLI:    assetStorageFromProject(root)      -> ./project-config.js (wrangler.toml)
 */

/** Pipeline conventions shared by every install. */
export const ASSET_DEFAULTS = Object.freeze({
  /** Transient intake prefix, safe to delete after a successful promote. */
  intakePrefix: "intake/",
  /** Canonical product folder root used by classify.js (products/<collection>/...). */
  productRoot: "products/",
  stage: Object.freeze({
    // Legacy paths retained for report compatibility; the promote path uses canonical keys.
    optimized: "uploads/staging/images/optimized",
    preview: "uploads/staging/images/preview",
    products: "uploads/staging/products",
    reports: "agentsam/asset-pipelines/reports",
  }),
  defaults: Object.freeze({
    maxWidth: 1600,
    previewWidth: 480,
    quality: 82,
    productMaxWidth: 1400,
    productQuality: 80,
  }),
});

const DEFAULT_BINDING = "WEBSITE_ASSETS";

function origin(value, label) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error(`asset storage: ${label} must be an absolute URL`);
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error(`asset storage: ${label} must be https`);
  }
  return url.href.replace(/\/+$/, "");
}

/**
 * Validate and freeze a storage description.
 * @param {{workerMediaBaseUrl:string, binding?:string, bucket?:string, accountId?:string,
 *          publicBaseUrl?:string|null, corsOrigins?:string[]}} input
 */
export function createAssetStorage(input = {}) {
  const bucket = input.bucket ? String(input.bucket) : null;
  const accountId = input.accountId ? String(input.accountId) : null;
  return Object.freeze({
    ...ASSET_DEFAULTS,
    accountId,
    bucket,
    binding: String(input.binding || DEFAULT_BINDING),
    s3Api: accountId && bucket ? `https://${accountId}.r2.cloudflarestorage.com/${bucket}` : null,
    /** Optional custom CDN hostname. Absent means the Worker /media path is the only delivery URL. */
    publicBaseUrl: input.publicBaseUrl ? origin(input.publicBaseUrl, "publicBaseUrl") : null,
    /** Verified Worker serve path. */
    workerMediaBaseUrl: origin(input.workerMediaBaseUrl, "workerMediaBaseUrl"),
    corsOrigins: Object.freeze([...(input.corsOrigins || [])]),
  });
}

let configured = null;

export function isAssetStorageConfigured() {
  return configured !== null;
}

/** Configure once per runtime. Reconfiguring with the same values is a no-op; different values throw. */
export function configureAssetStorage(input) {
  const next = createAssetStorage(input);
  if (configured) {
    if (JSON.stringify(configured) !== JSON.stringify(next)) {
      throw new Error("asset storage is already configured differently in this runtime");
    }
    return configured;
  }
  configured = next;
  return configured;
}

export function assetStorage() {
  if (!configured) {
    throw new Error(
      "Asset storage is not configured. Call configureAssetStorage() at startup " +
        "(Worker: ensureAssetStorage(env, request); CLI: assetStorageFromProject(root)).",
    );
  }
  return configured;
}

/** Derive public URLs from a durable r2_key; never persist signed URLs. */
export function publicUrlsForKey(r2Key) {
  const key = String(r2Key || "").replace(/^\/+/, "");
  const storage = assetStorage();
  return {
    key,
    worker: `${storage.workerMediaBaseUrl}/${key}`,
    cdn: storage.publicBaseUrl ? `${storage.publicBaseUrl}/${key}` : null,
  };
}

/**
 * Preferred delivery URL for app UIs. The Worker /media path is the verified default;
 * the CDN hostname is used only when asked for and configured.
 */
export function deliveryUrlForKey(r2Key, { preferWorker = true } = {}) {
  const urls = publicUrlsForKey(r2Key);
  return preferWorker || !urls.cdn ? urls.worker : urls.cdn;
}

/** Persistable relative compatibility path. */
export function mediaPathForKey(r2Key) {
  const key = String(r2Key || "").replace(/^\/+/, "");
  return `/media/${key}`;
}
