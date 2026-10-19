/**
 * Select an image for a specific print location and variant.
 * Never reuse a front catalog photo for an unverified back/side view.
 */
export type StudioSideMockup = {
  active?: number;
  preview_url?: string | null;
  print_location_id?: string | null;
  variant_scope_json?: string | null;
};

/**
 * Completeful uses attribute scopes such as {"Color":"Moss"} for garment
 * mockups, NOT necessarily a list of variant IDs. Never reject a real
 * provider Back image merely because its scope is attribute-based.
 */
function scopeMatchesVariant(scope: string | null | undefined, variantId: string,
  attributes: Record<string, string>): boolean {
  if (!scope?.trim()) return false;
  try {
    const parsed: unknown = JSON.parse(scope);
    if (Array.isArray(parsed)) return parsed.some((value) => String(value) === variantId);
    if (parsed && typeof parsed === "object") {
      const values = parsed as Record<string, unknown>;
      for (const key of ["variant_ids", "catalog_variant_ids", "completeful_variant_ids", "variants"]) {
        const candidate = values[key];
        if (Array.isArray(candidate)) return candidate.some((value) => String(value) === variantId);
      }
      const entries = Object.entries(values);
      if (!entries.length) return false;
      return entries.every(([key, value]) => {
        if (value == null || typeof value === "object") return false;
        const found = Object.entries(attributes).find(([candidate]) =>
          candidate.trim().toLowerCase() === key.trim().toLowerCase());
        return Boolean(found && found[1].trim().toLowerCase() === String(value).trim().toLowerCase());
      });
    }
  } catch {
    return false;
  }
  return false;
}

export function selectStudioSideImage(
  mockups: readonly StudioSideMockup[],
  locationId: string,
  variantId: string,
  artboardImage: string | null | undefined,
  frontVariantImage: string | null | undefined,
  isFront: boolean,
  variantAttributes: Record<string, string> = {},
  distinctProviderSideArtboard = false,
): string | null {
  const sideMockups = mockups.filter((mockup) =>
    mockup.active !== 0 &&
    mockup.print_location_id === locationId &&
    Boolean(mockup.preview_url)
  );
  const exactVariant = sideMockups.find((mockup) =>
    Boolean(mockup.variant_scope_json?.trim()) &&
    scopeMatchesVariant(mockup.variant_scope_json, variantId, variantAttributes)
  );
  if (exactVariant?.preview_url) return exactVariant.preview_url;
  // Catalog print-area artboards are real provider assets. Some products
  // (for example sunglasses Left/Right) have distinct side images even when
  // mockups are not variant-scoped. Do not discard those assets.
  // Never accept a mirrored Front URL as proof of a Back view.
  if (!isFront && distinctProviderSideArtboard && artboardImage) return artboardImage;
  // Generic artboard photos and unscoped mockups often depict only the
  // default (black) garment, regardless of the selected color. A preview of
  // an unverified color is worse than a truthful side-correct silhouette.
  // A front catalog image is safe only for the selected front variant.
  if (isFront) return frontVariantImage || artboardImage || null;
  return null;
}
