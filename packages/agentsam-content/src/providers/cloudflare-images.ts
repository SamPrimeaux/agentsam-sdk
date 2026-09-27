import type { ProviderRef } from "../core/source.js";
import type {
  ContentProvider,
  DeliveryOptions,
  ProviderListOptions,
  ProviderListResult,
  ProviderObject,
  ProviderUploadInput,
} from "./types.js";
import {
  CloudflareImagesTransport,
  type FetchLike,
} from "@inneranimalmedia/agentsam-cloudflare-images";

export interface CloudflareImagesConfig {
  accountId: string;
  apiToken: string;
  /** Images delivery account hash for imagedelivery.net URLs. */
  deliveryHash: string;
  fetch?: FetchLike;
  baseUrl?: string;
}

/**
 * Cloudflare Images provider — wraps shared transport.
 * Do not duplicate CF Images HTTP clients in Content or Brand.
 */
export function cloudflareImages(config: CloudflareImagesConfig): ContentProvider {
  const transport = new CloudflareImagesTransport({
    accountId: config.accountId,
    apiToken: config.apiToken,
    deliveryHash: config.deliveryHash,
    fetch: config.fetch,
    baseUrl: config.baseUrl,
  });

  const toObject = (img: {
    id: string;
    filename?: string;
    uploaded?: string;
    meta?: Record<string, unknown>;
    variants?: string[];
  }): ProviderObject => ({
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
      const result = await transport.list({ cursor: opts?.cursor, limit: opts?.limit });
      return {
        objects: result.images.map(toObject),
        cursor: result.nextCursor,
      };
    },

    async head(ref: string): Promise<ProviderObject | null> {
      const img = await transport.head(ref);
      return img ? toObject(img) : null;
    },

    async upload(input: ProviderUploadInput): Promise<ProviderRef> {
      const img = await transport.upload({
        name: input.name,
        mime: input.mime,
        bytes: input.bytes,
        fromUrl: input.fromUrl,
        meta: input.meta,
      });
      return { provider: "cloudflare-images", ref: img.id, role: "delivery", mime: input.mime };
    },

    async delete(ref: string): Promise<void> {
      await transport.delete(ref);
    },

    deliveryUrl(ref: string, opts?: DeliveryOptions): string {
      return transport.deliveryUrl(ref, opts);
    },
  };
}
