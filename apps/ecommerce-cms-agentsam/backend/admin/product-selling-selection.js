/**
 * Product Details read model for variants selected in Product Studio.
 * Catalog selections are not local stock and must not be written into
 * product_variants until the supplier product is actually linked.
 */
function safeAttributes(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function axisValue(attributes, name) {
  const entry = Object.entries(attributes).find(([key]) => key.toLowerCase() === name);
  return entry && entry[1] != null ? String(entry[1]) : null;
}
export function projectSelectedSupplierVariants(rows = []) {
  const variants = rows.map((row) => {
    const found = Boolean(row.completeful_variant_id);
    const attributes = { ...safeAttributes(row.attributes_json), ...safeAttributes(row.variant_attributes_json) };
    return {
      catalog_variant_id: String(row.catalog_variant_id),
      provider_sku: found ? String(row.provider_sku || "") : null,
      size: found ? axisValue(attributes, "size") : null,
      color: found ? (axisValue(attributes, "color") || axisValue(attributes, "colour")) : null,
      resolved: found,
    };
  });
  return {
    selected_count: variants.length,
    resolved_count: variants.filter((variant) => variant.resolved).length,
    unavailable_count: variants.filter((variant) => !variant.resolved).length,
    sizes: [...new Set(variants.map((v) => v.size).filter(Boolean))],
    colors: [...new Set(variants.map((v) => v.color).filter(Boolean))],
    variants,
  };
}
export async function readProductSupplierSelection(env, draft) {
  if (!draft?.selected_variant_ids_json) return null;
  const { results } = await env.DB.prepare(
    `SELECT selected.value AS catalog_variant_id,
            v.completeful_variant_id, v.sku AS provider_sku,
            v.attributes_json, v.variant_attributes_json
       FROM json_each(?) AS selected
       LEFT JOIN completeful_catalog_variants AS v
         ON v.completeful_variant_id = selected.value
        AND v.completeful_product_id = ?
      ORDER BY CAST(selected.key AS INTEGER)`
  ).bind(draft.selected_variant_ids_json, draft.completeful_catalog_product_id).all();
  return projectSelectedSupplierVariants(results || []);
}
