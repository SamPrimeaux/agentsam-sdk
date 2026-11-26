export type ProductSourceKind = "merchant_managed" | "connected_provider";

export interface ProductSource {
  product_id: number;
  kind: ProductSourceKind;
  provider: string | null;
  label: string;
  catalog_id: string | number | null;
  external_id: string | number | null;
  sync_status: string | null;
  manages_inventory: boolean;
}

export interface ProductInventoryRow {
  id: number | string;
  product_id: number | string;
  product_title?: string | null;
  status?: string | null;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  inventory_qty?: number | string | null;
  variant_price_cents?: number | string | null;
}

export interface ProductProviderLink {
  product_id: number | string;
  provider?: string | null;
  catalog_id?: string | number | null;
  external_id?: string | number | null;
  completeful_catalog_product_id?: string | number | null;
  completeful_store_product_id?: string | number | null;
  sync_status?: string | null;
}

export interface ProductInventoryGroup {
  id: number;
  title: string;
  status: string;
  source: Readonly<ProductSource>;
  variants: Array<{
    id: number; sku: string; size: string; color: string;
    inventory_qty: number; price_cents: number | null;
  }>;
  total_available: number;
  low_stock_count: number;
}

export const PRODUCT_SOURCE_KINDS: readonly ProductSourceKind[];
export function resolveProductSource(
  product: { id: number | string },
  linkedProvider?: ProductProviderLink | null,
): Readonly<ProductSource>;
export function groupProductInventory(
  rows?: ProductInventoryRow[],
  links?: ProductProviderLink[],
): ProductInventoryGroup[];
export function validateInventoryAdjustment(
  requested: number | string,
  expected?: number | string | null,
): Readonly<{ quantity: number; expected: number | null }>;
