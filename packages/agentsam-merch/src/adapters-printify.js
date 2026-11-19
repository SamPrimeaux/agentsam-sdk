function normalized(value) {
  return value == null ? null : String(value).trim().toLowerCase() || null;
}

function positiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function physicalInches(value, unit) {
  const n = positiveNumber(value);
  if (n == null) return null;
  switch (String(unit || "").trim().toLowerCase()) {
    case "in":
    case "inch":
    case "inches": return n;
    case "cm": return n / 2.54;
    case "mm": return n / 25.4;
    default: return null;
  }
}

/**
 * Adapt Printify blueprint/provider/variant/placeholder metadata to the
 * existing provider-neutral manufacturing preflight selection context.
 *
 * Printify catalogue placeholders may expose pixel dimensions. Pixel counts
 * are NOT physical print dimensions and must never be treated as inches.
 * Supply explicitly verified `options.physicalSize` only when available.
 * Provider rules, DPI requirements and production approval remain profile data.
 */
export function printifyProfileContext(
  blueprint = {},
  printProvider = {},
  variant = {},
  placeholder = {},
  options = {},
) {
  const declared = options.physicalSize || {};
  const unit = declared.unit;
  const declaredDpi = positiveNumber(options.providerDpi);
  return Object.freeze({
    manufacturer: "printify",
    process: normalized(placeholder.decoration_method || options.process),
    productType: normalized(blueprint.title || blueprint.name),
    locationName: normalized(placeholder.position || placeholder.name),
    printWidthIn: physicalInches(declared.width, unit),
    printHeightIn: physicalInches(declared.height, unit),
    providerDpi: declaredDpi,
    providerUnit: unit ? String(unit).toUpperCase() : null,
    providerProductId: blueprint.id ?? null,
    providerPrintProviderId: printProvider.id ?? null,
    providerVariantId: variant.id ?? null,
    providerLocationId: placeholder.position ?? placeholder.id ?? null,
  });
}

export function printifyTarget(physicalSize = {}, providerDpi = null) {
  return Object.freeze({
    printWidthIn: physicalInches(physicalSize.width, physicalSize.unit),
    printHeightIn: physicalInches(physicalSize.height, physicalSize.unit),
    providerDpi: positiveNumber(providerDpi),
    providerUnit: physicalSize.unit ? String(physicalSize.unit).toUpperCase() : null,
  });
}
