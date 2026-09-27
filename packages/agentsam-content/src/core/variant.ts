import type { ProviderRef } from "./source.js";

export type VariantName =
  | "thumbnail"
  | "avatar"
  | "small"
  | "medium"
  | "large"
  | "hero"
  | "public"
  | "poster"
  | "og"
  | "social"
  | (string & {});

export interface ContentVariant {
  name: VariantName;
  providerRef?: ProviderRef;
  url?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string; // "avif" | "webp" | "jpeg" | "png" | "mp4" | ...
  /** True when a human approved this derivative for delivery. */
  approved?: boolean;
  createdAt?: string;
}

/** Pick the best variant at or above a target width; fall back to largest. */
export function resolveVariant(
  variants: ContentVariant[],
  targetWidth: number,
): ContentVariant | undefined {
  const sized = variants.filter((v) => typeof v.width === "number");
  if (sized.length === 0) return variants[0];
  const atLeast = sized
    .filter((v) => (v.width as number) >= targetWidth)
    .sort((a, b) => (a.width as number) - (b.width as number));
  if (atLeast.length > 0) return atLeast[0];
  return sized.sort((a, b) => (b.width as number) - (a.width as number))[0];
}

/** Smallest approved delivery derivative, if any — e.g. the 140 KB AVIF for a 4.8 MB PNG. */
export function bestDeliveryVariant(variants: ContentVariant[]): ContentVariant | undefined {
  const approved = variants.filter((v) => v.approved && typeof v.bytes === "number");
  if (approved.length === 0) return undefined;
  return approved.sort((a, b) => (a.bytes as number) - (b.bytes as number))[0];
}
