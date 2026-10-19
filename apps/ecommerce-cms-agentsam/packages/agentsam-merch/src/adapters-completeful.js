function lower(value) {
  return value == null ? null : String(value).trim().toLowerCase();
}

/**
 * Translate Completeful catalog metadata into provider-neutral profile context.
 * No manufacturing requirement lives in this adapter.
 */
export function completefulProfileContext(product = {}, location = {}) {
  return Object.freeze({
    manufacturer: "completeful",
    process: lower(product.print_type || product.printType),
    productType: lower(product.product_type || product.productType),
    locationName: lower(location.name),
    printWidthIn: Number(location.file_width || location.fileWidth || 0) || null,
    printHeightIn: Number(location.file_height || location.fileHeight || 0) || null,
    providerDpi: Number(location.dpi || 0) || null,
    providerProductId:
      product.completeful_product_id || product.catalog_product_id || product.id || null,
    providerLocationId: location.print_location_id || location.id || null,
  });
}

export function completefulTarget(location = {}) {
  return Object.freeze({
    printWidthIn: Number(location.file_width || location.fileWidth || 0) || null,
    printHeightIn: Number(location.file_height || location.fileHeight || 0) || null,
    providerDpi: Number(location.dpi || 0) || null,
  });
}
