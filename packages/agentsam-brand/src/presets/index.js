import appIcon from './app-icon.json' with { type: 'json' };
import webImage from './web-image.json' with { type: 'json' };
import socialImage from './social-image.json' with { type: 'json' };
import favicon from './favicon.json' with { type: 'json' };
import ogImage from './og-image.json' with { type: 'json' };
import logo from './logo.json' with { type: 'json' };
import hero from './hero.json' with { type: 'json' };
import productShot from './product-shot.json' with { type: 'json' };
import model from './model.json' with { type: 'json' };

const PRESETS = Object.freeze({
  'app-icon': appIcon,
  favicon,
  logo,
  hero,
  'product-shot': productShot,
  model,
  'og-image': ogImage,
  'web-image': webImage,
  'social-image': socialImage,
});

export function listDerivativePresets() {
  return Object.values(PRESETS).map((p) => ({
    id: p.id,
    label: p.label,
    description: p.description,
    role: p.role || null,
    semantic: Boolean(p.semantic),
    derivative_count: (p.derivatives || []).length,
  }));
}

export function getDerivativePreset(id) {
  const row = PRESETS[String(id || '').trim()];
  if (!row) return null;
  return structuredClone(row);
}

export { PRESETS as DERIVATIVE_PRESETS };
