export const MANUFACTURING_PROFILE_SCHEMA = "agentsam.manufacturing-profile.v1";

export const RASTER_FORMATS = Object.freeze(["png", "jpg", "jpeg", "webp", "avif", "gif", "tiff"]);
export const VECTOR_FORMATS = Object.freeze(["svg", "eps", "ai"]);
export const DOCUMENT_FORMATS = Object.freeze(["pdf"]);

const supportedFormats = new Set([...RASTER_FORMATS, ...VECTOR_FORMATS, ...DOCUMENT_FORMATS]);

function cleanString(value) {
  return value == null ? null : String(value).trim();
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function normalizeFormat(value) {
  const format = cleanString(value)?.toLowerCase().replace(/^\./, "") || null;
  return format === "jpeg" ? "jpg" : format;
}

export function mediaKindForFormat(value) {
  const format = normalizeFormat(value);
  if (!format) return "unknown";
  if (RASTER_FORMATS.includes(format)) return "raster";
  if (VECTOR_FORMATS.includes(format)) return "vector";
  if (DOCUMENT_FORMATS.includes(format)) return "document";
  return "unknown";
}

export function normalizeManufacturingProfile(input = {}) {
  const format = normalizeFormat(input.format || input.preferredFormat);
  const formatKind = mediaKindForFormat(format);
  const allowRaster =
    typeof input.allowRaster === "boolean" ? input.allowRaster : formatKind === "raster";
  const allowVector =
    typeof input.allowVector === "boolean" ? input.allowVector : formatKind === "vector";

  return Object.freeze({
    ...input,
    schemaVersion: cleanString(input.schemaVersion) || MANUFACTURING_PROFILE_SCHEMA,
    id: cleanString(input.id),
    manufacturer: cleanString(input.manufacturer)?.toLowerCase() || null,
    process: cleanString(input.process)?.toLowerCase() || null,
    format,
    preferredFormat: format,
    colorSpace: cleanString(input.colorSpace)?.toLowerCase() || null,
    colorMode: cleanString(input.colorMode)?.toLowerCase() || null,
    ppi: positiveNumber(input.ppi),
    maxBytes: positiveNumber(input.maxBytes),
    preferredPrintWidthIn: positiveNumber(input.preferredPrintWidthIn),
    preferredPrintHeightIn: positiveNumber(input.preferredPrintHeightIn),
    allowRaster,
    allowVector,
    allowGradients: input.allowGradients !== false,
    requireClosedPaths: input.requireClosedPaths === true,
    outlineText: input.outlineText === true,
    requireAlpha: input.requireAlpha === true,
    alpha: input.alpha === true,
    handoff:
      input.handoff && typeof input.handoff === "object"
        ? Object.freeze({ ...input.handoff })
        : null,
    match:
      input.match && typeof input.match === "object"
        ? Object.freeze({ ...input.match })
        : null,
  });
}

export function validateManufacturingProfile(input) {
  const profile = normalizeManufacturingProfile(input);
  const errors = [];

  if (!profile.id) errors.push("id is required");
  if (!profile.manufacturer) errors.push("manufacturer is required");
  if (!profile.process) errors.push("process is required");
  if (!profile.format) errors.push("format or preferredFormat is required");
  if (profile.format && !supportedFormats.has(profile.format)) {
    errors.push(`unsupported format: ${profile.format}`);
  }
  if (!profile.allowRaster && !profile.allowVector && profile.format !== "pdf") {
    errors.push("profile must allow raster, vector, or a documented handoff format");
  }
  if (profile.ppi != null && profile.ppi < 36) {
    errors.push("ppi is implausibly low; use null for resolution-independent processes");
  }

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    profile,
  });
}
