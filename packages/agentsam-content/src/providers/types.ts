import type { ContentKind } from "../core/asset.js";
import type { ContentProviderName, ProviderRef } from "../core/source.js";

export type ProviderCapability =
  | "list"
  | "upload"
  | "delete"
  | "deliver"
  | "transform"
  | "stream"
  | "sync"
  | "download"
  | "captions"
  | "metadata";

export interface ProviderObject {
  ref: string;
  name?: string;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  createdAt?: string;
  meta?: Record<string, unknown>;
}

export interface ProviderListOptions {
  cursor?: string;
  limit?: number;
  prefix?: string;
}

export interface ProviderListResult {
  objects: ProviderObject[];
  cursor?: string;
}

export interface ProviderUploadInput {
  name: string;
  mime?: string;
  bytes?: Uint8Array;
  /** For providers that copy from a URL (CF Images/Stream support this). */
  fromUrl?: string;
  meta?: Record<string, string>;
}

export interface DeliveryOptions {
  width?: number;
  height?: number;
  format?: string; // "avif" | "webp" | "auto"...
  quality?: number;
  variant?: string; // CF Images named variant
  dpr?: number;
}

/**
 * Portable provider contract. The studio and runtime only ever see this;
 * Cloudflare/Drive/local specifics stay inside implementations.
 */
export interface ContentProvider {
  readonly name: ContentProviderName;
  readonly kinds: ContentKind[];
  readonly capabilities: ProviderCapability[];

  list(opts?: ProviderListOptions): Promise<ProviderListResult>;
  head(ref: string): Promise<ProviderObject | null>;
  upload(input: ProviderUploadInput): Promise<ProviderRef>;
  delete(ref: string): Promise<void>;

  /** Build an edge-delivery URL for a stored object, or null if not deliverable. */
  deliveryUrl(ref: string, opts?: DeliveryOptions): string | null;
}

export function hasCapability(p: ContentProvider, cap: ProviderCapability): boolean {
  return p.capabilities.includes(cap);
}

/** Injectable fetch so Workers/node/tests can supply their own transport. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
