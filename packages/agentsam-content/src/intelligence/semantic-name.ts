import type { ContentAsset } from "../core/asset.js";

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Propose a semantic alias without destructive rename:
 * original_name stays, semantic_alias is additive.
 * "IMG_5933.PNG" → "fuel-free-time-workbench-review-mobile-screenshot".
 */
export function proposeSemanticAlias(asset: ContentAsset): string {
  const parts: string[] = [];
  if (asset.brandId) parts.push(asset.brandId);
  const subject = asset.intelligence?.semantic?.subject ?? asset.title;
  if (subject) parts.push(subject);
  if (asset.role) parts.push(asset.role);
  if (parts.length === 0 && asset.tags.length > 0) parts.push(...asset.tags.slice(0, 3));
  if (parts.length === 0 && asset.filename) {
    parts.push(asset.filename.replace(/\.[a-z0-9]+$/i, ""));
  }
  if (parts.length === 0) parts.push(asset.kind, asset.id.slice(4, 10));
  return slugify(parts.join(" "));
}

/** Delivery filename for a variant: alias + width + format. */
export function deliveryFilename(alias: string, width?: number, format?: string): string {
  const w = width ? `-${width}` : "";
  const f = format ? `.${format}` : "";
  return `${alias}${w}${f}`;
}
