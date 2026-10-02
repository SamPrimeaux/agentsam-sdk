export const IMAGE_PREVIEW_PRESETS = Object.freeze([
  Object.freeze({ id: "original", label: "Original", width: null, height: null, aspect_ratio: null, fit: "contain", materialize: false }),
  Object.freeze({ id: "thumbnail", label: "Thumbnail", width: 150, height: 150, aspect_ratio: "1 / 1", fit: "cover", materialize: false }),
  Object.freeze({ id: "small", label: "Small", width: 400, height: 400, aspect_ratio: "1 / 1", fit: "cover", materialize: false }),
  Object.freeze({ id: "medium", label: "Medium", width: 800, height: 640, aspect_ratio: "5 / 4", fit: "cover", materialize: false }),
  Object.freeze({ id: "large", label: "Large", width: 1600, height: 1280, aspect_ratio: "5 / 4", fit: "cover", materialize: false }),
  Object.freeze({ id: "hero", label: "Hero", width: 1920, height: 1080, aspect_ratio: "16 / 9", fit: "cover", materialize: false })
]);

export const IMAGE_ASPECT_PRESETS = Object.freeze([
  Object.freeze({ id: "square", label: "1:1", aspect_ratio: "1 / 1" }),
  Object.freeze({ id: "social", label: "4:5", aspect_ratio: "4 / 5" }),
  Object.freeze({ id: "hero", label: "16:9", aspect_ratio: "16 / 9" }),
  Object.freeze({ id: "standard", label: "3:2", aspect_ratio: "3 / 2" }),
  Object.freeze({ id: "mobile", label: "9:16", aspect_ratio: "9 / 16" })
]);

export function getImagePreviewPreset(id, presets = IMAGE_PREVIEW_PRESETS) {
  const key = String(id || "original");
  return presets.find((preset) => preset.id === key) || presets[0] || null;
}

export function normalizeFocalPoint(value = {}) {
  const clamp = (n) => Math.max(0, Math.min(1, Number.isFinite(Number(n)) ? Number(n) : 0.5));
  return Object.freeze({ x: clamp(value.x), y: clamp(value.y) });
}

export function previewStyleForPreset(preset, options = {}) {
  const p = preset || IMAGE_PREVIEW_PRESETS[0];
  const focal = normalizeFocalPoint(options.focal);
  return Object.freeze({
    aspectRatio: p.aspect_ratio || "auto",
    objectFit: options.fit || p.fit || "contain",
    objectPosition: Math.round(focal.x * 100) + "% " + Math.round(focal.y * 100) + "%"
  });
}

export function previewLabel(preset) {
  if (!preset) return "";
  if (!preset.width || !preset.height) return preset.label;
  return preset.label + " · " + preset.width + "×" + preset.height;
}
