import appIcon from './app-icon.json' with { type: 'json' };
import webImage from './web-image.json' with { type: 'json' };
import socialImage from './social-image.json' with { type: 'json' };

const PRESETS = Object.freeze({
  'app-icon': appIcon,
  'web-image': webImage,
  'social-image': socialImage,
});

export function listDerivativePresets() {
  return Object.values(PRESETS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    derivative_count: (p.derivatives || []).length,
  }));
}

export function getDerivativePreset(id) {
  const row = PRESETS[String(id || '').trim()];
  if (!row) return null;
  return structuredClone(row);
}

export { PRESETS as DERIVATIVE_PRESETS };
