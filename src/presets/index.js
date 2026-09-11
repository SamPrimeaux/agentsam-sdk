import catalog from '../../protocol/presets/catalog.json' with { type: 'json' };

export const PRESET_CATALOG_VERSION = catalog.schema_version;

export function getPresetCatalog() { return structuredClone(catalog); }
export function listPresets() { return Object.values(catalog.presets).map((row) => structuredClone(row)); }
export function getPreset(id) {
  const row = catalog.presets[String(id || '').trim().toLowerCase()];
  return row ? structuredClone(row) : null;
}
export function resolvePreset(id = 'fullstack') {
  const preset = getPreset(id);
  if (!preset) throw new Error(`unknown_preset:${id}; expected ${Object.keys(catalog.presets).join(',')}`);
  return preset;
}
export function listAddons() { return Object.values(catalog.addons).map((row) => structuredClone(row)); }
export function getAddon(id) {
  const row = catalog.addons[String(id || '').trim().toLowerCase()];
  return row ? structuredClone(row) : null;
}
