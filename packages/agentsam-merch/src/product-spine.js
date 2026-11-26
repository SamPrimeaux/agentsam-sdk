/**
 * One commerce authority for every supplier: products -> product_variants.
 * Provider records are optional integrations, not separate merchant products.
 * This module is pure and portable; no D1, token, HTTP, or UI dependencies.
 */
export function resolveProductSource(product, linkedProvider = null) {
  const id = Number(product?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new TypeError("Valid merchant product id required");
  // Provider links are optional adapters around the merchant-owned product.
  // Completeful's existing D1 link shape remains supported, while future
  // wholesalers can supply a normalized provider/external_id pair without
  // introducing a parallel products or variants table.
  const legacyCompleteful = linkedProvider?.completeful_store_product_id || linkedProvider?.completeful_catalog_product_id;
  const providerId = typeof linkedProvider?.provider === 'string' ? linkedProvider.provider.trim().toLowerCase() : '';
  const validProvider = /^[a-z0-9][a-z0-9_-]{0,63}$/.test(providerId) && !['none', 'unknown', 'local'].includes(providerId);
  const linkedCatalog = linkedProvider?.catalog_id ?? linkedProvider?.completeful_catalog_product_id ?? null;
  const linkedExternal = linkedProvider?.external_id ?? linkedProvider?.completeful_store_product_id ?? null;
  if (legacyCompleteful || (validProvider && (linkedCatalog != null || linkedExternal != null))) {
    const provider = legacyCompleteful ? 'completeful' : providerId;
    return Object.freeze({
      product_id: id,
      kind: "connected_provider",
      provider,
      label: provider === 'completeful' ? 'Completeful' : providerId,
      catalog_id: linkedCatalog,
      external_id: linkedExternal,
      sync_status: linkedProvider.sync_status || 'pending',
      manages_inventory: true,
    });
  }
  return Object.freeze({
    product_id: id,
    kind: "merchant_managed",
    provider: null,
    label: "Store-managed",
    catalog_id: null,
    external_id: null,
    sync_status: null,
    manages_inventory: true,
  });
}

export function groupProductInventory(rows = [], links = []) {
  const sourceByProduct = new Map();
  for (const link of links) {
    const id = Number(link?.product_id);
    if (Number.isSafeInteger(id) && id > 0 && !sourceByProduct.has(id)) sourceByProduct.set(id, link);
  }
  const groups = new Map();
  const seenVariants = new Set();
  for (const row of rows) {
    const id = Number(row?.product_id);
    const variantId = Number(row?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(variantId) || variantId <= 0 || seenVariants.has(variantId)) continue;
    seenVariants.add(variantId);
    let group = groups.get(id);
    if (!group) {
      group = {
        id, title: String(row.product_title || 'Untitled product'), status: String(row.status || 'draft'),
        source: resolveProductSource({ id }, sourceByProduct.get(id)),
        variants: [], total_available: 0, low_stock_count: 0,
      };
      groups.set(id, group);
    }
    const qty = Number(row.inventory_qty);
    const inventory = Number.isSafeInteger(qty) && qty >= 0 ? qty : 0;
    group.variants.push({
      id: variantId, sku: String(row.sku || ''), size: String(row.size || ''),
      color: String(row.color || ''), inventory_qty: inventory,
      price_cents: row.variant_price_cents == null ? null : Number(row.variant_price_cents),
    });
    group.total_available += inventory;
    if (inventory <= 3) group.low_stock_count++;
  }
  return [...groups.values()].map((group) => ({
    ...group,
    variants: group.variants.sort((a,b) =>
      a.size.localeCompare(b.size,undefined,{numeric:true}) || a.color.localeCompare(b.color) || a.sku.localeCompare(b.sku))
  })).sort((a,b) => (b.low_stock_count > 0) - (a.low_stock_count > 0) ||
    a.title.localeCompare(b.title));
}

export const PRODUCT_SOURCE_KINDS = Object.freeze(['merchant_managed', 'connected_provider']);

/** Concurrency-aware merchant stock update input; no provider-specific SKU storage. */
export function validateInventoryAdjustment(requested, expected = null) {
  const qty = Number(requested);
  if (requested == null || requested === "" || !Number.isSafeInteger(qty) || qty < 0 || qty > 100000000) {
    throw new RangeError("Inventory must be a non-negative whole number");
  }
  const old = expected == null ? null : Number(expected);
  if (old != null && (!Number.isSafeInteger(old) || old < 0 || old > 100000000)) {
    throw new RangeError("The prior inventory quantity is invalid");
  }
  return Object.freeze({ quantity: qty, expected: old });
}
