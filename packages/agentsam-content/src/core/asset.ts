/**
 * Core content asset contracts.
 *
 * A ContentAsset is a provider-independent identity. Providers hold
 * representations (ProviderRef[]); the asset holds meaning, lifecycle,
 * usage, provenance and intelligence.
 */

import type { ContentOrigin, ContentState } from "./origin.js";
import type { ContentSource, ProviderRef } from "./source.js";
import type { ContentVariant } from "./variant.js";
import type { ContentUsage } from "./usage.js";
import type { ContentProvenance } from "./provenance.js";
import type { ActorRef } from "./actor.js";
import type { ContentIntelligence } from "./intelligence.js";

export type ContentKind =
  | "image"
  | "video"
  | "model"
  | "audio"
  | "document"
  | "font";

export interface ContentAsset {
  /** Stable identity: ast_... — never a provider id. */
  id: string;

  accountId: string;
  brandId?: string;
  projectId?: string;

  kind: ContentKind;

  origin: ContentOrigin;
  state: ContentState;

  source: ContentSource;
  /** One asset, many provider representations (master, derivative, backup...). */
  providerRefs: ProviderRef[];

  title?: string;
  /** Original filename as uploaded/imported — never destructively renamed. */
  filename?: string;
  /** Human/SEO-facing semantic alias, e.g. "agentsam-workbench-review-mobile". */
  semanticAlias?: string;
  /** Delivery alias used to build URLs; defaults to semanticAlias. */
  deliveryAlias?: string;

  mime?: string;
  bytes?: number;

  width?: number;
  height?: number;
  /** Milliseconds for time-based media. */
  durationMs?: number;

  tags: string[];
  resourceTags?: Record<string, string>;

  /** Semantic role: "hero" | "logo" | "product" | "poster" | ... */
  role?: string;

  alt?: string;
  caption?: string;

  variants: ContentVariant[];
  usage: ContentUsage[];

  provenance: ContentProvenance;

  createdBy: ActorRef;
  createdAt: string;
  updatedAt: string;

  /** -1 | 0 | +1 human signal harvested from the donor rate endpoints. */
  rating?: number;

  intelligence?: ContentIntelligence;

  /** Kind-specific extension payload (ImageAssetExt | VideoAssetExt | ModelAssetExt...). */
  ext?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Kind-specific extensions                                            */
/* ------------------------------------------------------------------ */

export interface ImageAssetExt {
  hasAlpha?: boolean;
  colorSpace?: string;
  exif?: Record<string, string | number>;
  dominantColors?: string[];
}

export interface VideoAssetExt {
  streamStatus?: "queued" | "inprogress" | "ready" | "error";
  posterUrl?: string;
  playbackUrl?: string;
  hlsUrl?: string;
  dashUrl?: string;
  captions?: Array<{ language: string; label: string; url?: string }>;
  downloadsEnabled?: boolean;
  requireSignedURLs?: boolean;
  resolution?: string;
  fps?: number;
}

export interface ModelAssetExt {
  format?: "glb" | "gltf" | "usdz";
  triangles?: number;
  materials?: number;
  textures?: number;
  animations?: number;
  boundingBox?: { min: [number, number, number]; max: [number, number, number] };
  /** Harvested from the Fuel & Free Time GLB inspector. */
  camera?: { theta: number; phi: number; radius: number; fov: number };
  placement?: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  };
}

export interface DocumentAssetExt {
  pages?: number;
  wordCount?: number;
}

export function isImage(a: ContentAsset): boolean {
  return a.kind === "image";
}
export function isVideo(a: ContentAsset): boolean {
  return a.kind === "video";
}
export function isModel(a: ContentAsset): boolean {
  return a.kind === "model";
}
