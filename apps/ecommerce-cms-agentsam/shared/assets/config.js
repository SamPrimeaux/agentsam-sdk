/**
 * Deployment asset-storage config — SSOT for CLI + Worker hooks.
 * The reusable pipeline consumes this contract; deployment values live here.
 */
export const ASSET_STORAGE = Object.freeze({
  accountId: "demo-commerce-account",
  bucket: "ember",
  binding: "WEBSITE_ASSETS",
  location: "WNAM",
  s3Api: "https://demo-commerce-account.r2.cloudflarestorage.com/ember",
  /** Preferred public hostname (Active custom domain). May 404 until CDN path proven. */
  publicBaseUrl: "https://assets.ember.example",
  /** Verified Worker serve path. */
  workerMediaBaseUrl: "https://ember.example/media",
  corsOrigins: Object.freeze([
    "https://ember.example",
    "https://www.ember.example",
    "https://ember.meauxbility.workers.dev",
    "http://localhost:8787",
    "http://127.0.0.1:8787",
  ]),
  /** Transient intake prefix — safe to delete after successful promote. */
  intakePrefix: "intake/",
  stage: Object.freeze({
    // Legacy paths retained for report compatibility; new promote path uses canonical keys.
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

/** @deprecated Deployment compatibility alias. New reusable code uses ASSET_STORAGE. */
export const COMMERCE_R2 = ASSET_STORAGE;

/** Derive public URLs from durable r2_key — never persist signed URLs. */
export function publicUrlsForKey(r2Key) {
  const key = String(r2Key || "").replace(/^\/+/, "");
  return {
    key,
    worker: `${ASSET_STORAGE.workerMediaBaseUrl}/${key}`,
    cdn: `${ASSET_STORAGE.publicBaseUrl}/${key}`,
  };
}

/**
 * Preferred delivery URL for app UIs.
 * CDN custom domain is canonical when healthy; Worker /media is the verified fallback.
 * Pass preferWorker=true when CDN is known unhealthy (current: assets.* often 404).
 */
export function deliveryUrlForKey(r2Key, { preferWorker = true } = {}) {
  const urls = publicUrlsForKey(r2Key);
  return preferWorker ? urls.worker : urls.cdn;
}

/** Persistable relative compatibility path. */
export function mediaPathForKey(r2Key) {
  const key = String(r2Key || "").replace(/^\/+/, "");
  return `/media/${key}`;
}
