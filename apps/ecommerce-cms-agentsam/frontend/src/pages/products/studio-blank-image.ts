import type { CatalogProduct, Variant } from "./studio-model";

/**
 * Supplier image references are NOT interchangeable:
 * - variant.realistic_image_url /mockups/<product>/<render>/background.png is
 *   the supplier's unprinted garment background for that selected color.
 * - variant.cover_image_url may be a generic product-level marketing photo
 *   (verified for Gildan 2400 Ash Grey / S, whose cover shows a BLACK shirt).
 * - the separate product mockup gallery and print-location artboards may
 *   contain demonstration artwork, so never use them as blank garment bases.
 *
 * A background image is a photo/reference, NOT a Completeful-produced mockup
 * and NOT verification of Front/Back side. Those require a provider render.
 */
function isCleanSupplierBackground(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const path = new URL(url).pathname;
    return /\/mockups\/[^/]+\/[^/]+\/background\.(?:png|jpe?g|webp)$/i.test(path);
  } catch {
    return false;
  }
}

/** Preserve exact variant color; never borrow a product-level generic image. */
export function blankGarmentImageSources(
  variant: Variant | null | undefined,
  product: CatalogProduct,
): string[] {
  if (!variant) return [];
  // Do not silently downgrade a failed photo to a generic illustration.
  if (isCleanSupplierBackground(variant.realistic_image_url)) {
    return [variant.realistic_image_url];
  }
  const candidates = [
    variant.cover_image_url && variant.cover_image_url !== product.cover_image_url
      ? variant.cover_image_url : null,
    variant.main_icon_url && variant.main_icon_url !== product.main_icon_url
      ? variant.main_icon_url : null,
  ];
  return [...new Set(candidates.filter((url): url is string => Boolean(url)))];
}
