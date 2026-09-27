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
 * CMS provider — an ingest facade, not a storage system.
 *
 * `cms/imports` becomes provenance, not a dumping ground: this provider
 * enumerates discovered assets from a crawl/archive/theme export so the
 * runtime can import them with origin "cms-import" and a batch id. Bytes
 * ultimately land in a real storage provider (R2/CF Images/Stream).
 */
export interface CmsDiscoveredAsset {
  ref: string; // URL or archive path
  name: string;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  sourceUrl?: string;
}

export interface CmsProviderConfig {
  /** e.g. "site-crawl:https://old-customer-site.com" or "archive:old-theme.zip" */
  sourceRef: string;
  discover: (opts?: ProviderListOptions) => Promise<{ assets: CmsDiscoveredAsset[]; cursor?: string }>;
  fetchBytes?: (ref: string) => Promise<Uint8Array>;
}

export function cms(config: CmsProviderConfig): ContentProvider & {
  readonly sourceRef: string;
  fetchBytes?: (ref: string) => Promise<Uint8Array>;
} {
  return {
    name: "cms",
    kinds: ["image", "video", "model", "audio", "document", "font"],
    capabilities: ["list", "sync", "metadata"],
    sourceRef: config.sourceRef,
    fetchBytes: config.fetchBytes,

    async list(opts?: ProviderListOptions): Promise<ProviderListResult> {
      const { assets, cursor } = await config.discover(opts);
      const objects: ProviderObject[] = assets.map((a) => ({
        ref: a.ref,
        name: a.name,
        mime: a.mime,
        bytes: a.bytes,
        width: a.width,
        height: a.height,
        meta: { sourceUrl: a.sourceUrl },
      }));
      return { objects, cursor };
    },

    async head(ref: string): Promise<ProviderObject | null> {
      const { assets } = await config.discover();
      const found = assets.find((a) => a.ref === ref);
      return found
        ? { ref: found.ref, name: found.name, mime: found.mime, bytes: found.bytes }
        : null;
    },

    async upload(_input: ProviderUploadInput): Promise<ProviderRef> {
      throw new Error("cms provider is read-only; import into a storage provider instead");
    },

    async delete(_ref: string): Promise<void> {
      throw new Error("cms provider is read-only");
    },

    deliveryUrl(_ref: string, _opts?: DeliveryOptions): string | null {
      return null;
    },
  };
}
