function lower(value) {
  return value == null ? null : String(value).trim().toLowerCase();
}

function toInches(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const normalized = String(unit || "IN").trim().toUpperCase();
  if (normalized === "IN" || normalized === "INCH" || normalized === "INCHES") {
    return number;
  }
  if (normalized === "CM") return number / 2.54;
  if (normalized === "MM") return number / 25.4;
  return null;
}

function physicalTarget(location = {}) {
  const unit = location.unit || location.file_unit || location.fileUnit || "IN";
  return {
    printWidthIn: toInches(location.file_width || location.fileWidth, unit),
    printHeightIn: toInches(location.file_height || location.fileHeight, unit),
    providerDpi: Number(location.dpi || 0) || null,
    providerUnit: String(unit).toUpperCase(),
  };
}

/**
 * Translate Completeful catalog metadata into provider-neutral profile context.
 * No manufacturing requirement lives in this adapter.
 */
export function completefulProfileContext(product = {}, location = {}) {
  const target = physicalTarget(location);
  return Object.freeze({
    manufacturer: "completeful",
    process: lower(product.print_type || product.printType),
    productType: lower(product.product_type || product.productType),
    locationName: lower(location.name),
    ...target,
    providerProductId:
      product.completeful_product_id ||
      product.catalog_product_id ||
      product.id ||
      null,
    providerLocationId: location.print_location_id || location.id || null,
  });
}

export function completefulTarget(location = {}) {
  return Object.freeze(physicalTarget(location));
}
