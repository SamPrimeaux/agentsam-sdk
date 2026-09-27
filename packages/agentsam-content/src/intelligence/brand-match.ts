import type { ContentAsset } from "../core/asset.js";

export interface BrandPack {
  brandId: string;
  name: string;
  keywords: string[];
  colors?: string[];
  motifs?: string[];
}

export interface BrandMatchResult {
  brandId: string;
  confidence: number; // 0..1
  matchedOn: string[];
}

/**
 * Deterministic brand match against brand pack keywords/motifs
 * using the asset's own textual metadata. Semantic enrichment can
 * refine this; it never replaces it.
 */
export function matchBrand(asset: ContentAsset, packs: BrandPack[]): BrandMatchResult | undefined {
  const hay = [
    asset.title,
    asset.filename,
    asset.semanticAlias,
    asset.alt,
    asset.caption,
    ...asset.tags,
    asset.intelligence?.semantic?.subject,
    asset.intelligence?.semantic?.description,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let best: BrandMatchResult | undefined;
  for (const pack of packs) {
    const terms = [...pack.keywords, ...(pack.motifs ?? []), pack.name];
    const matchedOn = terms.filter((t) => t && hay.includes(t.toLowerCase()));
    if (matchedOn.length === 0) continue;
    const confidence = Math.min(1, matchedOn.length / Math.max(3, terms.length * 0.5));
    if (!best || confidence > best.confidence) {
      best = { brandId: pack.brandId, confidence, matchedOn };
    }
  }
  if (asset.brandId && (!best || best.brandId !== asset.brandId)) {
    // Explicit association always wins over inference.
    return { brandId: asset.brandId, confidence: 1, matchedOn: ["explicit-association"] };
  }
  return best;
}
