/** One renderer resolver shared by CMS catalog verification, installation and publication. */
import '../../packages/theme-contract/runtime/platform-stock-sections.js';
import '../../packages/theme-contract/runtime/portable-sections.js';
import {
  ThemeScenesSections,
  THEME_SCENES_CMS_STYLES,
} from '../../packages/theme-contract/runtime/theme-scenes-sections.mjs';

export function getCmsSectionRenderer(rendererKey) {
  if (!rendererKey) return null;
  if (ThemeScenesSections.get(rendererKey)) return ThemeScenesSections;
  const portable = globalThis.ThemePortableSections;
  if (typeof portable?.get === 'function' && portable.get(rendererKey) &&
      typeof portable.render === 'function' && typeof portable.validate === 'function') {
    return portable;
  }
  return null;
}

export function isThemeScenesRenderer(rendererKey) {
  return Boolean(ThemeScenesSections.get(rendererKey));
}

export { ThemeScenesSections, THEME_SCENES_CMS_STYLES };
