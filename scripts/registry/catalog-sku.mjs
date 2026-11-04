/** Stable internal product references. Not npm/PyPI coordinates, commercial offers, or merchandise SKUs. */
export const PRODUCT_SKU_KINDS = Object.freeze({
  app: "APP",
  "sdk-package": "SDK",
  integration: "INT",
  theme: "THM",
  section: "SEC",
  block: "BLK",
  "ui-component": "CMP",
  script: "SCR",
  service: "SVC",
  solution: "SOL",
  product: "PRD",
  collection: "COL",
  "product-line": "LINE",
});

/**
 * Generate a candidate for a new catalog product.
 * Assign it once at creation; do not recalculate on slug/kind rename.
 * Confirm unique availability in agentsam_products before insert.
 */
export function productCatalogSku(kind, slug) {
  const code = PRODUCT_SKU_KINDS[kind];
  if (!code) throw new TypeError("Unsupported product kind: " + kind);
  if (typeof slug !== "string") throw new TypeError("Product slug must be a string");
  const stem = slug.trim().replaceAll("_", "-").toUpperCase();
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(stem)) {
    throw new TypeError("Invalid catalog product slug: " + slug);
  }
  return "IA-" + code + "-" + stem;
}
