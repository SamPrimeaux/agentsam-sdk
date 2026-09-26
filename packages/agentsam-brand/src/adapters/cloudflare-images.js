/**
 * Cloudflare Images delivery adapter.
 *
 * HARD RULE: An asset is "on Cloudflare Images" ONLY when POST
 * /accounts/{account_id}/images/v1 returns success + non-empty result.id.
 *
 * Account-level identity (never infer from R2):
 *   CLOUDFLARE_ACCOUNT_ID            — management/API identity (non-secret)
 *   CLOUDFLARE_IMAGES_ACCOUNT_HASH   — delivery namespace (non-secret)
 *   CLOUDFLARE_IMAGES_API_TOKEN      — secret Bearer credential (canonical)
 *   CLOUDFLARE_API_TOKEN             — broader compatibility fallback
 *
 * R2 keys, WEBSITE_ASSETS bindings, and D1 rows are never evidence of Images.
 */

/** Cloudflare-hosted Images accepts these inputs (plan-dependent for some). */
export const CLOUDFLARE_IMAGES_PLATFORM_INPUT_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/heic',
  'image/avif',
]);

/**
 * AgentSam publishing policy (not a Cloudflare limitation):
 * prefer a canonical PNG as the Images delivery source so CF can negotiate
 * WebP/AVIF output. Explicit WebP/AVIF/SVG archives stay in storage (R2).
 */
export const AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES = Object.freeze(['image/png']);

export function resolveCloudflareImagesCredentials(env = process.env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || '').trim();
  // Canonical least-privilege token first; broader session token as fallback.
  // CLOUDFLARE_IMAGES_TOKEN retained as deprecated alias only.
  const tokenSource = env.CLOUDFLARE_IMAGES_API_TOKEN
    ? 'CLOUDFLARE_IMAGES_API_TOKEN'
    : env.CLOUDFLARE_API_TOKEN
      ? 'CLOUDFLARE_API_TOKEN'
      : env.CLOUDFLARE_IMAGES_TOKEN
        ? 'CLOUDFLARE_IMAGES_TOKEN'
        : null;
  const apiToken = tokenSource ? String(env[tokenSource] || '').trim() : '';
  return {
    accountId,
    accountHash,
    apiToken,
    tokenEnv: tokenSource,
    // Opaque credential — never validate by shape/prefix (cfat_ or otherwise)
    tokenConfigured: Boolean(apiToken),
  };
}

/** Public delivery base — derived from account hash, not independently configured. */
export function cloudflareImagesDeliveryBase(accountHash) {
  const hash = String(accountHash || '').trim();
  if (!hash) return null;
  return `https://imagedelivery.net/${hash}`;
}

/**
 * Construct a delivery URL only from verified Images identity.
 * Prefer Cloudflare-returned variants[] over reconstruction when available.
 */
export function cloudflareImageUrl({ accountHash, imageId, variant = 'public' } = {}) {
  const hash = String(accountHash || '').trim();
  const id = String(imageId || '').trim();
  const v = String(variant || 'public').trim() || 'public';
  if (!hash || !id) return null;
  return `https://imagedelivery.net/${hash}/${id}/${v}`;
}

export function resolveCloudflareImagesConfig(env = process.env) {
  const creds = resolveCloudflareImagesCredentials(env);
  const deliveryBase = cloudflareImagesDeliveryBase(creds.accountHash);
  return {
    provider: 'cloudflare-images',
    accountId: creds.accountId || null,
    accountHash: creds.accountHash || null,
    deliveryBase,
    apiTokenConfigured: creds.tokenConfigured,
    tokenEnv: creds.tokenEnv,
    authMode: 'bearer_api_token',
    requiredPermission: 'Account → Images → Write',
    apiUploadPath: '/accounts/{account_id}/images/v1',
  };
}

export class CloudflareImagesDeliveryAdapter {
  constructor({
    accountId,
    accountHash,
    apiToken,
    env = process.env,
    /**
     * AgentSam policy default: PNG-only delivery source.
     * Pass CLOUDFLARE_IMAGES_PLATFORM_INPUT_TYPES to allow full CF input set.
     */
    acceptedContentTypes = [...AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES],
    fetchImpl = globalThis.fetch,
  } = {}) {
    const resolved = resolveCloudflareImagesCredentials(env);
    this.provider = 'cloudflare-images';
    this.accountId = String(accountId ?? resolved.accountId ?? '').trim();
    this.accountHash = String(accountHash ?? resolved.accountHash ?? '').trim();
    this.apiToken = String(apiToken ?? resolved.apiToken ?? '').trim();
    this.tokenEnv = apiToken
      ? 'constructor'
      : resolved.tokenEnv;
    this.acceptedContentTypes = new Set(acceptedContentTypes);
    this.policy = 'agentsam.canonical_png';
    this.fetchImpl = fetchImpl;
  }

  get deliveryBase() {
    return cloudflareImagesDeliveryBase(this.accountHash);
  }

  authHeaders() {
    return { Authorization: `Bearer ${this.apiToken}` };
  }

  /**
   * Capability snapshot. `authorized` stays false until verifyConnection() succeeds.
   */
  async capabilities() {
    const configured = Boolean(this.accountId && this.apiToken);
    return {
      provider: this.provider,
      available: true,
      configured,
      authorized: false,
      account_resolved: Boolean(this.accountId),
      account_hash_resolved: Boolean(this.accountHash),
      delivery_base: this.deliveryBase,
      token_env: this.tokenEnv,
      auth_mode: 'bearer_api_token',
      required_permission: 'Account → Images → Write',
      api_path: '/accounts/{account_id}/images/v1',
      // Policy vs platform — do not conflate
      agentsam_delivery_policy_types: [...AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES],
      cloudflare_platform_input_types: [...CLOUDFLARE_IMAGES_PLATFORM_INPUT_TYPES],
      accepted_content_types: [...this.acceptedContentTypes],
      policy: this.policy,
    };
  }

  /**
   * Live verify against Cloudflare Images API (stats).
   * Env presence alone is never proof of authorization.
   */
  async verifyConnection() {
    const config = {
      account_id: this.accountId || null,
      account_hash: this.accountHash || null,
      delivery_base: this.deliveryBase,
      token_env: this.tokenEnv,
      auth_mode: 'bearer_api_token',
      required_permission: 'Account → Images → Write',
    };

    if (!this.accountId || !this.apiToken) {
      return {
        ok: false,
        provider: this.provider,
        configured: false,
        authorized: false,
        reason: 'not_configured',
        error: 'cloudflare_images_credentials_required',
        hint: 'Set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_IMAGES_API_TOKEN (Images Write)',
        config,
      };
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1/stats`;
    let res;
    let body;
    try {
      res = await this.fetchImpl(url, {
        method: 'GET',
        headers: this.authHeaders(),
      });
      body = await res.json().catch(() => ({}));
    } catch (err) {
      return {
        ok: false,
        provider: this.provider,
        configured: true,
        authorized: false,
        reason: 'network_error',
        error: String(err?.message || err),
        config,
      };
    }

    const authorized = Boolean(res.ok && body?.success !== false);
    return {
      ok: authorized,
      provider: this.provider,
      configured: true,
      authorized,
      reason: authorized ? 'verified' : 'api_unauthorized',
      error: authorized
        ? null
        : (body?.errors?.[0]?.message || `cf_images_verify_failed:${res.status}`),
      http_status: res.status,
      stats: authorized ? (body?.result || null) : null,
      config: {
        ...config,
        // Mirror Local Studio / dashboard vocabulary
        authentication: 'API token',
        permission: authorized ? 'Images Write ✓' : 'Images Write unverified',
      },
    };
  }

  async supports({ contentType } = {}) {
    const mime = String(contentType || '').toLowerCase();
    return this.acceptedContentTypes.has(mime);
  }

  /**
   * @returns {Promise<{
   *   ok: boolean,
   *   provider: 'cloudflare-images',
   *   status: 'planned'|'published'|'failed'|'skipped',
   *   provider_receipt?: object,
   *   error?: string,
   * }>}
   */
  async upload({
    filePath,
    fileName,
    contentType = 'image/png',
    metadata = {},
    dryRun = false,
    sourceSha256 = null,
    sourceStorage = null,
  } = {}) {
    const mime = String(contentType || metadata.contentType || 'image/png').toLowerCase();
    if (!(await this.supports({ contentType: mime }))) {
      return {
        ok: true,
        provider: this.provider,
        status: 'skipped',
        reason: 'agentsam_delivery_policy',
        content_type: mime,
        note: 'AgentSam prefers canonical PNG for Images; other formats remain storage-only. Cloudflare itself accepts broader inputs.',
      };
    }

    if (dryRun) {
      return {
        ok: true,
        provider: this.provider,
        status: 'planned',
        dry_run: true,
        provider_receipt: null,
        account_id: this.accountId || null,
        account_hash: this.accountHash || null,
        source: sourceStorage || null,
      };
    }

    if (!this.accountId || !this.apiToken) {
      return {
        ok: false,
        provider: this.provider,
        status: 'failed',
        error: 'cloudflare_images_credentials_required',
        reason: 'not_configured',
      };
    }

    const fs = await import('node:fs');
    const form = new FormData();
    const buf = fs.readFileSync(filePath);
    form.append('file', new Blob([buf], { type: mime }), fileName || 'image.png');
    const metaPayload = {
      ...metadata,
      ...(sourceSha256 ? { source_sha256: String(sourceSha256).replace(/^sha256:/, '') } : {}),
    };
    if (Object.keys(metaPayload).length) {
      form.append('metadata', JSON.stringify(metaPayload));
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1`;
    let res;
    let body;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: this.authHeaders(),
        body: form,
      });
      body = await res.json().catch(() => ({}));
    } catch (err) {
      return {
        ok: false,
        provider: this.provider,
        status: 'failed',
        error: String(err?.message || err),
        reason: 'network_error',
      };
    }

    const imageId = body?.result?.id ? String(body.result.id).trim() : '';
    if (!res.ok || body?.success === false || !imageId) {
      return {
        ok: false,
        provider: this.provider,
        status: 'failed',
        error:
          body?.errors?.[0]?.message
          || (!imageId && res.ok ? 'cloudflare_images_missing_result_id' : `cf_images_upload_failed:${res.status}`),
        reason: !imageId && res.ok ? 'missing_result_id' : 'api_error',
        http_status: res.status,
      };
    }

    const variants = Array.isArray(body.result?.variants) ? body.result.variants : [];
    return {
      ok: true,
      provider: this.provider,
      status: 'published',
      provider_receipt: {
        // Account-level + image-level identity — never from R2
        account_id: this.accountId,
        account_hash: this.accountHash || null,
        delivery_base: this.deliveryBase,
        image_id: imageId,
        provider_asset_id: imageId,
        filename: body.result?.filename || fileName || null,
        // Receipt truth from Cloudflare — prefer over reconstructed URLs
        variants,
        uploaded_at: body.result?.uploaded || null,
        requireSignedURLs: body.result?.requireSignedURLs ?? null,
        source_sha256: sourceSha256 || null,
        // Provenance only — NEVER evidence that Images ≡ R2
        source: sourceStorage
          ? {
            storage_provider: sourceStorage.provider || null,
            bucket: sourceStorage.bucket || null,
            key: sourceStorage.key || null,
          }
          : null,
      },
    };
  }

  /** Fetch one image by id — used by integration verify. */
  async get(imageId) {
    if (!this.accountId || !this.apiToken || !imageId) {
      return { ok: false, error: 'not_configured_or_missing_id' };
    }
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1/${encodeURIComponent(imageId)}`;
    const res = await this.fetchImpl(url, {
      headers: this.authHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    const id = body?.result?.id ? String(body.result.id) : '';
    return {
      ok: Boolean(res.ok && body?.success && id),
      provider: this.provider,
      provider_receipt: id
        ? {
          account_id: this.accountId,
          account_hash: this.accountHash || null,
          delivery_base: this.deliveryBase,
          image_id: id,
          provider_asset_id: id,
          variants: body.result?.variants || [],
          filename: body.result?.filename || null,
          uploaded_at: body.result?.uploaded || null,
        }
        : null,
      http_status: res.status,
    };
  }

  async delete(imageId) {
    if (!this.accountId || !this.apiToken || !imageId) {
      return { ok: false, error: 'not_configured_or_missing_id' };
    }
    const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/images/v1/${encodeURIComponent(imageId)}`;
    const res = await this.fetchImpl(url, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: Boolean(res.ok && body?.success !== false), http_status: res.status };
  }
}

/** True only when a real Images publish receipt exists. */
export function isCloudflareImagesPublished(delivery) {
  if (!delivery || delivery.provider !== 'cloudflare-images') return false;
  if (delivery.status !== 'published') return false;
  const id = delivery.provider_receipt?.provider_asset_id
    || delivery.provider_receipt?.image_id
    || delivery.provider_asset_id;
  return Boolean(id && String(id).trim());
}

/**
 * AgentSam delivery-source policy (canonical PNG).
 * Not a Cloudflare API limitation — CF accepts broader inputs.
 */
export function mayUploadToCloudflareImages(contentType, { policy = 'agentsam' } = {}) {
  const mime = String(contentType || '').toLowerCase();
  if (policy === 'platform') return CLOUDFLARE_IMAGES_PLATFORM_INPUT_TYPES.includes(mime);
  return AGENTSAM_IMAGES_DELIVERY_POLICY_TYPES.includes(mime);
}
