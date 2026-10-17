/**
 * Programmatic SEO + Cloudflare/R2 tags for brand/product assets.
 * Tags travel with optimize reports and (when supported) R2 custom metadata.
 */

/**
 * @param {{
 *   r2Key: string,
 *   brand?: string,
 *   productSlug?: string|null,
 *   collection?: string|null,
 *   assetKind?: 'image'|'icon'|'video'|'glb'|'product',
 *   alt?: string|null,
 *   source?: string|null,
 * }} input
 */
export function buildAssetTags(input) {
  const brand = input.brand || "Fuel & Free Time";
  const kind = input.assetKind || "image";
  const key = String(input.r2Key || "");
  const file = key.split("/").pop() || "";
  const stem = file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();

  const seo = {
    title: input.productSlug
      ? `${humanize(input.productSlug)} — ${brand}`
      : `${humanize(stem) || "Product photo"} — ${brand}`,
    alt:
      input.alt ||
      (input.productSlug
        ? `${humanize(input.productSlug)} product photo for ${brand}`
        : `${humanize(stem) || "Lifestyle"} photo — ${brand}`),
    description: `${brand} ${kind} asset${input.collection ? ` · ${humanize(input.collection)}` : ""}`,
    keywords: [
      "fuel and free time",
      "fuel n freetime",
      brand.toLowerCase(),
      kind,
      input.productSlug,
      input.collection,
    ].filter(Boolean),
  };

  /** Cloudflare / R2 custom metadata (string values only). */
  const cf = {
    "fnf-brand": brand,
    "fnf-asset-kind": kind,
    "fnf-pipeline": "fnf_image_pipeline",
    "fnf-optimized": "1",
    "fnf-source-key": key.slice(0, 200),
    ...(input.productSlug ? { "fnf-product-slug": String(input.productSlug).slice(0, 120) } : {}),
    ...(input.collection ? { "fnf-collection": String(input.collection).slice(0, 120) } : {}),
    ...(input.source ? { "fnf-source": String(input.source).slice(0, 80) } : {}),
    "fnf-seo-alt": seo.alt.slice(0, 200),
  };

  return { seo, cf };
}

function humanize(s) {
  return String(s || "")
    .replace(/\.(jpe?g|png|webp|gif|glb|usdz)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Infer product slug / collection from R2 key under products/. */
export function inferProductContextFromKey(r2Key) {
  const parts = String(r2Key || "").split("/").filter(Boolean);
  // products/<collection>/foo.webp → collection=<collection>, product from filename
  // products/<product-slug>/img.png → collection+slug folder
  if (parts[0] !== "products") {
    return { productSlug: null, collection: null, assetKind: "image" };
  }
  if (parts.length >= 3) {
    return {
      collection: parts[1],
      productSlug: parts[1],
      assetKind: "product",
    };
  }
  if (parts.length === 2) {
    return { collection: "products", productSlug: null, assetKind: "product" };
  }
  return { productSlug: null, collection: "products", assetKind: "product" };
}
