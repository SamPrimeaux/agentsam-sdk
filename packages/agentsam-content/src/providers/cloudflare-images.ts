import type { ProviderRef } from "../core/source.js";
import type {
  ContentProvider,
  DeliveryOptions,
  FetchLike,
  ProviderListOptions,
  ProviderListResult,
  ProviderObject,
  ProviderUploadInput,
} from "./types.js";

export interface CloudflareImagesConfig {
  accountId: string;
  apiToken: string;
  /** Images delivery account hash for imagedelivery.net URLs. */
  deliveryHash: string;
  fetch?: FetchLike;
  baseUrl?: string;
}

interface CFImageRecord {
  id: string;
  filename?: string;
  uploaded?: string;
  meta?: Record<string, unknown>;
  variants?: string[];
}

/**
 * Cloudflare Images provider — edge delivery + transformations.
 */
export function cloudflareImages(config: CloudflareImagesConfig): ContentProvider {
  const f: FetchLike = config.fetch ?? ((url, init) => fetch(url, init));
  const base =
    config.baseUrl ??
    `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/images/v1`;
  const headers = { Authorization: `Bearer ${config.apiToken}` };

  const toObject = (img: CFImageRecord): ProviderObject => ({
    ref: img.id,
    name: img.filename,
    createdAt: img.uploaded,
    meta: { ...img.meta, variants: img.variants },
  });

  return {
    name: "cloudflare-images",
    kinds: ["image"],
    capabilities: ["list", "upload", "delete", "deliver", "transform", "metadata"],

    async list(opts?: ProviderListOptions): Promise<ProviderListResult> {
      const page = opts?.cursor ?? "1";
      const perPage = opts?.limit ?? 100;
      const res = await f(`${base}?page=${page}&per_page=${perPage}`, { headers });
      if (!res.ok) throw new Error(`cloudflare-images list failed: ${res.status}`);
      const body = (await res.json()) as { result?: { images?: CFImageRecord[] } };
      const images = body.result?.images ?? [];
      return {
        objects: images.map(toObject),
        cursor: images.length === perPage ? String(Number(page) + 1) : undefined,
      };
    },

    async head(ref: string): Promise<ProviderObject | null> {
      const res = await f(`${base}/${ref}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`cloudflare-images head failed: ${res.status}`);
      const body = (await res.json()) as { result?: CFImageRecord };
      return body.result ? toObject(body.result) : null;
    },

    async upload(input: ProviderUploadInput): Promise<ProviderRef> {
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
      const res = await f(base, { method: "POST", headers, body: form });
      if (!res.ok) throw new Error(`cloudflare-images upload failed: ${res.status}`);
      const body = (await res.json()) as { result?: CFImageRecord };
      const id = body.result?.id;
      if (!id) throw new Error("cloudflare-images upload returned no id");
      return { provider: "cloudflare-images", ref: id, role: "delivery", mime: input.mime };
    },

    async delete(ref: string): Promise<void> {
      const res = await f(`${base}/${ref}`, { method: "DELETE", headers });
      if (!res.ok && res.status !== 404) {
        throw new Error(`cloudflare-images delete failed: ${res.status}`);
      }
    },

    deliveryUrl(ref: string, opts?: DeliveryOptions): string {
      if (opts?.variant) {
        return `https://imagedelivery.net/${config.deliveryHash}/${ref}/${opts.variant}`;
      }
      const params: string[] = [];
      if (opts?.width) params.push(`w=${opts.width}`);
      if (opts?.height) params.push(`h=${opts.height}`);
      if (opts?.format) params.push(`f=${opts.format}`);
      if (opts?.quality) params.push(`q=${opts.quality}`);
      if (opts?.dpr) params.push(`dpr=${opts.dpr}`);
      const flex = params.length > 0 ? params.join(",") : "public";
      return `https://imagedelivery.net/${config.deliveryHash}/${ref}/${flex}`;
    },
  };
}
