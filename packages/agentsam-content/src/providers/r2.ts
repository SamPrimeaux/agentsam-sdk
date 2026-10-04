import type { ProviderRef } from "../core/source.js";
import type {
  ContentProvider,
  DeliveryOptions,
  ProviderListOptions,
  ProviderListResult,
  ProviderObject,
  ProviderUploadInput,
} from "./types.js";

/**
 * Minimal structural typing of a Cloudflare R2 bucket binding
 * (Workers runtime). Kept structural so this package has no
 * dependency on @cloudflare/workers-types.
 */
export interface R2BucketLike {
  list(options?: {
    prefix?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{
    objects: Array<{
      key: string;
      size: number;
      uploaded: Date | string;
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }>;
    truncated: boolean;
    cursor?: string;
  }>;
  head(key: string): Promise<{
    key: string;
    size: number;
    uploaded: Date | string;
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  } | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface R2Config {
  bucket: R2BucketLike;
  bucketName?: string;
  /** Public delivery domain bound to the bucket, e.g. https://media.example.com */
  publicBaseUrl?: string;
  /** Key prefix namespace, e.g. "brands/ember/". */
  prefix?: string;
}

/** R2 provider — masters, archives, derivatives. */
export function r2(config: R2Config): ContentProvider {
  const prefix = config.prefix ?? "";
  const withPrefix = (key: string) => (key.startsWith(prefix) ? key : prefix + key);

  return {
    name: "r2",
    kinds: ["image", "video", "model", "audio", "document", "font"],
    capabilities: ["list", "upload", "delete", "download", "metadata", ...(config.publicBaseUrl ? (["deliver"] as const) : [])],

    async list(opts?: ProviderListOptions): Promise<ProviderListResult> {
      const res = await config.bucket.list({
        prefix: opts?.prefix ? withPrefix(opts.prefix) : prefix || undefined,
        cursor: opts?.cursor,
        limit: opts?.limit,
      });
      return {
        objects: res.objects.map((o) => ({
          ref: o.key,
          name: o.key.split("/").pop(),
          bytes: o.size,
          mime: o.httpMetadata?.contentType,
          createdAt: typeof o.uploaded === "string" ? o.uploaded : o.uploaded.toISOString(),
          meta: o.customMetadata,
        })),
        cursor: res.truncated ? res.cursor : undefined,
      };
    },

    async head(ref: string): Promise<ProviderObject | null> {
      const o = await config.bucket.head(ref);
      if (!o) return null;
      return {
        ref: o.key,
        name: o.key.split("/").pop(),
        bytes: o.size,
        mime: o.httpMetadata?.contentType,
        createdAt: typeof o.uploaded === "string" ? o.uploaded : o.uploaded.toISOString(),
        meta: o.customMetadata,
      };
    },

    async upload(input: ProviderUploadInput): Promise<ProviderRef> {
      if (!input.bytes) throw new Error("r2 upload requires bytes");
      const key = withPrefix(input.name);
      await config.bucket.put(key, input.bytes, {
        httpMetadata: { contentType: input.mime },
        customMetadata: input.meta,
      });
      return {
        provider: "r2",
        ref: key,
        role: "master",
        scope: config.bucketName,
        bytes: input.bytes.byteLength,
        mime: input.mime,
      };
    },

    async delete(ref: string): Promise<void> {
      await config.bucket.delete(ref);
    },

    deliveryUrl(ref: string, _opts?: DeliveryOptions): string | null {
      if (!config.publicBaseUrl) return null;
      return `${config.publicBaseUrl.replace(/\/$/, "")}/${ref}`;
    },
  };
}
