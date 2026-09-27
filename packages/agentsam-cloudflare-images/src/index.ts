export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CloudflareImagesCredentials {
  accountId: string;
  accountHash: string;
  apiToken: string;
  tokenEnv: string | null;
  tokenConfigured: boolean;
}

export interface CloudflareImagesEnv {
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_IMAGES_ACCOUNT_HASH?: string;
  CLOUDFLARE_IMAGES_API_TOKEN?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_IMAGES_TOKEN?: string;
  [key: string]: string | undefined;
}

/** Resolve CF Images credentials from an env-like bag. Never validate token shape. */
export function resolveCloudflareImagesCredentials(
  env: CloudflareImagesEnv = {},
): CloudflareImagesCredentials {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  const accountHash = String(env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || "").trim();
  const tokenSource = env.CLOUDFLARE_IMAGES_API_TOKEN
    ? "CLOUDFLARE_IMAGES_API_TOKEN"
    : env.CLOUDFLARE_API_TOKEN
      ? "CLOUDFLARE_API_TOKEN"
      : env.CLOUDFLARE_IMAGES_TOKEN
        ? "CLOUDFLARE_IMAGES_TOKEN"
        : null;
  const apiToken = tokenSource ? String(env[tokenSource] || "").trim() : "";
  return {
    accountId,
    accountHash,
    apiToken,
    tokenEnv: tokenSource,
    tokenConfigured: Boolean(apiToken),
  };
}

export function cloudflareImagesDeliveryBase(accountHash: string): string | null {
  const hash = String(accountHash || "").trim();
  if (!hash) return null;
  return `https://imagedelivery.net/${hash}`;
}

export function cloudflareImageUrl(opts: {
  accountHash: string;
  imageId: string;
  variant?: string;
}): string | null {
  const hash = String(opts.accountHash || "").trim();
  const id = String(opts.imageId || "").trim();
  const v = String(opts.variant || "public").trim() || "public";
  if (!hash || !id) return null;
  return `https://imagedelivery.net/${hash}/${id}/${v}`;
}

export function cloudflareImagesApiBase(accountId: string, baseUrl?: string): string {
  if (baseUrl) return baseUrl.replace(/\/$/, "");
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;
}

export interface CloudflareImagesTransportConfig {
  accountId: string;
  apiToken: string;
  deliveryHash: string;
  fetch?: FetchLike;
  baseUrl?: string;
}

export interface CfImageRecord {
  id: string;
  filename?: string;
  uploaded?: string;
  meta?: Record<string, unknown>;
  variants?: string[];
}

export interface DeliveryOptions {
  variant?: string;
  width?: number;
  height?: number;
  format?: string;
  quality?: number;
  dpr?: number;
}

/**
 * Shared HTTP transport for Cloudflare Images.
 * Content providers and Brand delivery adapters should wrap this — not duplicate it.
 */
export class CloudflareImagesTransport {
  readonly accountId: string;
  readonly deliveryHash: string;
  readonly apiToken: string;
  private readonly fetchImpl: FetchLike;
  private readonly base: string;

  constructor(config: CloudflareImagesTransportConfig) {
    this.accountId = config.accountId;
    this.deliveryHash = config.deliveryHash;
    this.apiToken = config.apiToken;
    this.fetchImpl = config.fetch ?? ((url, init) => fetch(url, init));
    this.base = cloudflareImagesApiBase(config.accountId, config.baseUrl);
  }

  authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiToken}` };
  }

  deliveryUrl(ref: string, opts?: DeliveryOptions): string {
    if (opts?.variant) {
      return `https://imagedelivery.net/${this.deliveryHash}/${ref}/${opts.variant}`;
    }
    const params: string[] = [];
    if (opts?.width) params.push(`w=${opts.width}`);
    if (opts?.height) params.push(`h=${opts.height}`);
    if (opts?.format) params.push(`f=${opts.format}`);
    if (opts?.quality) params.push(`q=${opts.quality}`);
    if (opts?.dpr) params.push(`dpr=${opts.dpr}`);
    const flex = params.length > 0 ? params.join(",") : "public";
    return `https://imagedelivery.net/${this.deliveryHash}/${ref}/${flex}`;
  }

  async list(opts?: { cursor?: string; limit?: number }): Promise<{
    images: CfImageRecord[];
    nextCursor?: string;
  }> {
    const page = opts?.cursor ?? "1";
    const perPage = opts?.limit ?? 100;
    const res = await this.fetchImpl(`${this.base}?page=${page}&per_page=${perPage}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`cloudflare-images list failed: ${res.status}`);
    const body = (await res.json()) as { result?: { images?: CfImageRecord[] } };
    const images = body.result?.images ?? [];
    return {
      images,
      nextCursor: images.length === perPage ? String(Number(page) + 1) : undefined,
    };
  }

  async head(ref: string): Promise<CfImageRecord | null> {
    const res = await this.fetchImpl(`${this.base}/${ref}`, { headers: this.authHeaders() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`cloudflare-images head failed: ${res.status}`);
    const body = (await res.json()) as { result?: CfImageRecord };
    return body.result ?? null;
  }

  async upload(input: {
    name: string;
    mime?: string;
    bytes?: Uint8Array;
    fromUrl?: string;
    meta?: Record<string, unknown>;
  }): Promise<CfImageRecord> {
    const form = new FormData();
    if (input.fromUrl) {
      form.append("url", input.fromUrl);
    } else if (input.bytes) {
      form.append(
        "file",
        new Blob([input.bytes as BlobPart], { type: input.mime ?? "application/octet-stream" }),
        input.name,
      );
    } else {
      throw new Error("cloudflare-images upload requires bytes or fromUrl");
    }
    if (input.meta) form.append("metadata", JSON.stringify(input.meta));
    const res = await this.fetchImpl(this.base, {
      method: "POST",
      headers: this.authHeaders(),
      body: form,
    });
    if (!res.ok) throw new Error(`cloudflare-images upload failed: ${res.status}`);
    const body = (await res.json()) as { result?: CfImageRecord };
    if (!body.result?.id) throw new Error("cloudflare-images upload returned no id");
    return body.result;
  }

  async delete(ref: string): Promise<void> {
    const res = await this.fetchImpl(`${this.base}/${ref}`, {
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`cloudflare-images delete failed: ${res.status}`);
    }
  }

  async stats(): Promise<{ ok: boolean; status: number; body: unknown }> {
    const res = await this.fetchImpl(`${this.base}/stats`, { headers: this.authHeaders() });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body };
  }
}
