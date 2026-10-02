/**
 * Product Studio catalog model — aligned to agentsam.commerce.catalog.v1.
 * Provider-specific ids (completeful_*) are optional aliases from the host adapter.
 */

export type CatalogProduct = {
  /** Canonical catalog id for Product Studio / commerce.catalog */
  catalog_product_id: string;
  name: string;
  product_type?: string;
  print_type?: string;
  material?: string;
  sku?: string;
  default_title?: string;
  default_description?: string;
  available?: number;
  pricing_currency?: string;
  fulfillment_cost_free_cents?: number | null;
  realistic_image_url?: string;
  cover_image_url?: string;
  main_icon_url?: string;
  variant_count?: number;
  print_location_count?: number;
  mockup_count?: number;
  provider?: string;
  provider_product_id?: string;
  /** @deprecated adapter alias — prefer catalog_product_id */
  completeful_product_id?: string;
};

export type Variant = {
  catalog_variant_id: string;
  variant_title?: string;
  name?: string;
  title?: string;
  sku?: string;
  is_primary?: number;
  is_lead?: number;
  pricing_currency?: string;
  fulfillment_cost_free_cents?: number | null;
  cover_image_url?: string;
  main_icon_url?: string;
  realistic_image_url?: string;
  attributes?: Record<string, string>;
  variant_attributes?: Record<string, string>;
  attributes_json?: string | Record<string, unknown> | null;
  variant_attributes_json?: string | Record<string, unknown> | null;
  provider_variant_id?: string;
  /** @deprecated adapter alias — prefer catalog_variant_id */
  completeful_variant_id?: string;
};

export type PrintLocation = {
  print_location_id: string;
  name: string;
  enabled: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  artboard_width?: number;
  artboard_height?: number;
  file_width?: number;
  file_height?: number;
  dpi?: number;
  unit?: string;
  shape_type?: string;
  artboard_image_url?: string;
};

export type ProductDetail = {
  product: CatalogProduct;
  variants: Variant[];
  print_locations: PrintLocation[];
  images: { url: string; thumbnail_url?: string; is_primary?: number; variant_title?: string }[];
  image_pagination?: {
    limit: number;
    count: number;
    total: number;
    has_more: boolean;
  };
  mockups: {
    mockup_id: string;
    name: string;
    preview_url?: string;
    active: number;
  }[];
};

export type MediaAsset = {
  id: number;
  url: string;
  filename: string;
  content_type?: string;
  size_bytes?: number;
};

export type CatalogResponse = {
  items: CatalogProduct[];
  pagination: { total: number; has_more: boolean };
};

/** Resolve canonical product id from catalog contract or Completeful adapter alias. */
export function catalogProductId(p: CatalogProduct | null | undefined): string {
  if (!p) return "";
  return (
    p.catalog_product_id ||
    p.provider_product_id ||
    p.completeful_product_id ||
    ""
  );
}

/** Resolve canonical variant id from catalog contract or Completeful adapter alias. */
export function catalogVariantId(v: Variant | null | undefined): string {
  if (!v) return "";
  return (
    v.catalog_variant_id ||
    v.provider_variant_id ||
    v.completeful_variant_id ||
    ""
  );
}

/**
 * Normalize host/admin payloads that still emit completeful_* into commerce.catalog shape.
 */
export function normalizeCatalogProduct(
  raw: Partial<CatalogProduct> & Record<string, unknown>,
): CatalogProduct {
  const completefulId =
    typeof raw.completeful_product_id === "string"
      ? raw.completeful_product_id
      : undefined;
  const catalogId =
    (typeof raw.catalog_product_id === "string" && raw.catalog_product_id) ||
    (typeof raw.provider_product_id === "string" && raw.provider_product_id) ||
    completefulId ||
    "";
  return {
    ...raw,
    catalog_product_id: catalogId,
    name: String(raw.name || ""),
    provider: typeof raw.provider === "string" ? raw.provider : "completeful",
    provider_product_id:
      (typeof raw.provider_product_id === "string" && raw.provider_product_id) ||
      completefulId,
    completeful_product_id: completefulId || catalogId || undefined,
  };
}

function normalizeAttributes(value: unknown): Record<string, string> {
  let source = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return {};
    }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>)
      .filter(([, entry]) => entry != null && ["string", "number", "boolean"].includes(typeof entry))
      .map(([key, entry]) => [key, String(entry)]),
  );
}

export function normalizeVariant(
  raw: Partial<Variant> & Record<string, unknown>,
): Variant {
  const completefulId =
    typeof raw.completeful_variant_id === "string"
      ? raw.completeful_variant_id
      : undefined;
  const catalogId =
    (typeof raw.catalog_variant_id === "string" && raw.catalog_variant_id) ||
    (typeof raw.provider_variant_id === "string" && raw.provider_variant_id) ||
    completefulId ||
    "";
  const attributes = {
    ...normalizeAttributes(raw.attributes_json),
    ...normalizeAttributes(raw.attributes),
    ...normalizeAttributes(raw.variant_attributes_json),
    ...normalizeAttributes(raw.variant_attributes),
  };
  return {
    ...raw,
    catalog_variant_id: catalogId,
    attributes,
    provider_variant_id:
      (typeof raw.provider_variant_id === "string" && raw.provider_variant_id) ||
      completefulId,
    completeful_variant_id: completefulId || catalogId || undefined,
  };
}

export function variantAttributes(v: Variant | null | undefined): Record<string, string> {
  if (!v) return {};
  if (v.attributes && Object.keys(v.attributes).length) return v.attributes;
  return {
    ...normalizeAttributes(v.attributes_json),
    ...normalizeAttributes(v.variant_attributes_json),
    ...normalizeAttributes(v.variant_attributes),
  };
}

export function variantAxes(variants: Variant[]): string[] {
  const axes: string[] = [];
  for (const variant of variants) {
    for (const key of Object.keys(variantAttributes(variant))) {
      if (!axes.includes(key)) axes.push(key);
    }
  }
  return axes;
}

export function variantAxisValues(variants: Variant[], axis: string): string[] {
  const values: string[] = [];
  for (const variant of variants) {
    const value = variantAttributes(variant)[axis];
    if (value && !values.includes(value)) values.push(value);
  }

  if (/size/i.test(axis)) {
    const sizeOrder = [
      "XXS",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "2XL",
      "3XL",
      "4XL",
      "5XL",
      "6XL",
    ];
    return [...values].sort((a, b) => {
      const ai = sizeOrder.indexOf(a.toUpperCase());
      const bi = sizeOrder.indexOf(b.toUpperCase());
      if (ai === -1 && bi === -1) return a.localeCompare(b, undefined, { numeric: true });
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  return values;
}

export function selectVariantForAxis(
  variants: Variant[],
  current: Variant | null | undefined,
  axis: string,
  value: string,
): Variant | undefined {
  const currentAttributes = variantAttributes(current);
  const candidates = variants.filter(
    (variant) => variantAttributes(variant)[axis] === value,
  );
  if (!candidates.length) return undefined;

  return candidates
    .map((variant) => {
      const attributes = variantAttributes(variant);
      const score = Object.entries(currentAttributes).reduce(
        (total, [key, currentValue]) =>
          key === axis || attributes[key] !== currentValue ? total : total + 1,
        0,
      );
      return { variant, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.variant.is_lead || 0) - Number(a.variant.is_lead || 0) ||
        Number(b.variant.is_primary || 0) - Number(a.variant.is_primary || 0),
    )[0]?.variant;
}

export const variantImage = (v: Variant | null | undefined) =>
  v?.realistic_image_url || v?.cover_image_url || v?.main_icon_url;

export const productImage = (p: CatalogProduct) =>
  p.realistic_image_url || p.cover_image_url || p.main_icon_url;

export function printPixelSize(location?: PrintLocation) {
  if (
    !location?.file_width ||
    !location.file_height ||
    location.file_width <= 0 ||
    location.file_height <= 0
  )
    return null;
  const unit = location.unit?.toLowerCase();
  const dpi = location.dpi && location.dpi > 0 ? location.dpi : 300;
  const factor =
    unit === "px" || unit === "pixel" || unit === "pixels"
      ? 1
      : unit === "in" || unit === "inch" || unit === "inches"
        ? dpi
        : unit === "cm"
          ? dpi / 2.54
          : unit === "mm"
            ? dpi / 25.4
            : null;
  return factor == null
    ? null
    : {
        width: Math.round(location.file_width * factor),
        height: Math.round(location.file_height * factor),
      };
}

export function printSizeLabel(location?: PrintLocation) {
  if (!location?.file_width || !location.file_height)
    return "Print dimensions not supplied";
  const pixels = printPixelSize(location);
  return `${location.file_width} × ${location.file_height} ${location.unit || "(unit not supplied)"}${pixels && location.unit?.toLowerCase() !== "px" ? ` · ${pixels.width} × ${pixels.height} px` : ""}`;
}

export function costLabel(p: CatalogProduct | Variant) {
  if (p.fulfillment_cost_free_cents == null) return "Cost on request";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: p.pricing_currency || "USD",
    }).format(p.fulfillment_cost_free_cents / 100);
  } catch {
    return `${(p.fulfillment_cost_free_cents / 100).toFixed(2)} ${p.pricing_currency || "USD"}`;
  }
}
