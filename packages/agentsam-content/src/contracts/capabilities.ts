/**
 * Capability-split provider contracts.
 *
 * Storage ≠ delivery ≠ source/import ≠ video delivery ≠ knowledge.
 * Legacy ContentProvider remains for migration; new hosts should advertise
 * fine-grained adapters and let runtime.capabilities() drive the UI.
 */

import type { ContentKind } from "../core/asset.js";
import type { ProviderRef } from "../core/source.js";
import type {
  DeliveryOptions,
  ProviderListOptions,
  ProviderListResult,
  ProviderObject,
  ProviderUploadInput,
} from "../providers/types.js";

/** Dot-capability ids the UI and agents can query. */
export type ContentCapabilityId =
  | "source.list"
  | "source.discover"
  | "source.import"
  | "storage.read"
  | "storage.write"
  | "storage.delete"
  | "storage.upload"
  | "delivery.url"
  | "delivery.transform"
  | "delivery.variant"
  | "delivery.signed-url"
  | "video.upload"
  | "video.stream"
  | "video.poster"
  | "video.captions"
  | "video.tus"
  | "video.direct-upload"
  | "local.browse"
  | "local.watch"
  | "local.process"
  | "knowledge.index"
  | "knowledge.search"
  | (string & {});

export interface CapabilityDescriptor {
  id: ContentCapabilityId;
  /** Adapter that provides it, e.g. "cloudflare-r2", "local-host". */
  provider: string;
  label?: string;
  status?: "available" | "attachable" | "unavailable";
}

export interface ContentSourceAdapter {
  readonly id: string;
  readonly capabilities: ContentCapabilityId[];
  discover?(opts?: ProviderListOptions): Promise<ProviderListResult>;
  list(opts?: ProviderListOptions): Promise<ProviderListResult>;
  import?(ref: string): Promise<ProviderRef>;
}

export interface ContentStorageAdapter {
  readonly id: string;
  readonly capabilities: ContentCapabilityId[];
  readonly kinds?: ContentKind[];
  put(input: ProviderUploadInput): Promise<ProviderRef>;
  get(ref: string): Promise<ProviderObject | null>;
  head(ref: string): Promise<ProviderObject | null>;
  delete(ref: string): Promise<void>;
}

export interface ContentDeliveryAdapter {
  readonly id: string;
  readonly capabilities: ContentCapabilityId[];
  deliveryUrl(ref: string, opts?: DeliveryOptions): string | null;
  variants?(ref: string): Promise<string[]>;
  transform?(ref: string, opts: DeliveryOptions): string | null;
}

export interface ContentVideoDeliveryAdapter {
  readonly id: string;
  readonly capabilities: ContentCapabilityId[];
  upload(input: ProviderUploadInput): Promise<ProviderRef>;
  streamUrl(ref: string, format?: "hls" | "dash" | "iframe"): string | null;
  poster?(ref: string): string | null;
  captions?(ref: string): Promise<Array<{ language: string; label: string; url?: string }>>;
}

export interface AdapterRegistrySnapshot {
  sources: ContentSourceAdapter[];
  storage: ContentStorageAdapter[];
  delivery: ContentDeliveryAdapter[];
  video: ContentVideoDeliveryAdapter[];
}
