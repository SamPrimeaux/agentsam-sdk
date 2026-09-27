/**
 * Page presets — composition only. Content is injected via SECTION_CONTENT.
 */

import { SCROLL_PRESETS } from '../contracts/index.js';
import { createSection } from '../scenes/index.js';
import { createShellContent } from '../shell/index.js';

const DEFAULT_ROUTES = Object.freeze({
  home: '/',
  'work.index': '/work',
  about: '/about',
  services: '/services',
  contact: '/contact',
  'product.agentsam': '/agentsam',
  'product.database': '/database',
  'product.cad': '/cad',
  'product.cloud': '/cloud',
  learn: '/learn',
});

/**
 * Agency / institutional home: quiet hero → product demo → bridge → gallery → capabilities.
 */
export function createAgencyHomePreset(content = {}) {
  const c = content;
  return {
    id: c.id || 'agency-home',
    theme: c.theme || 'inneranimal',
    routes: { ...DEFAULT_ROUTES, ...(c.routes || {}) },
    shell: createShellContent(c.shell || { header: 'adaptive', footer: 'default' }),
    sections: [
      createSection({
        id: 'intro',
        scene: 'hero.scroll-product',
        visual: 'visual.orbital-field',
        theme: { surface: 'inverse', headerTone: 'auto' },
        scroll: { ...SCROLL_PRESETS['sticky-story'], length: 210 },
        motion: { profile: 'story', intensity: 0.34 },
        groups: c.heroGroups || [],
        contentRef: c.heroRef || 'home.hero',
      }),
      createSection({
        id: 'flagship-demo',
        scene: 'product.demo',
        demo: 'agentsam-mini-composer',
        theme: { surface: 'inverse' },
        scroll: SCROLL_PRESETS['sticky-story'],
        groups: c.demoGroups || [],
        contentRef: c.demoRef || 'products.agentsam',
      }),
      createSection({
        id: 'bridge',
        scene: 'bridge.theme',
        scroll: SCROLL_PRESETS.bridge,
        groups: c.bridgeGroups || [],
        contentRef: c.bridgeRef || 'home.bridge',
      }),
      createSection({
        id: 'selected-work',
        scene: 'work.gallery',
        theme: { surface: 'canvas' },
        groups: c.workGroups || [],
        contentRef: c.workRef || 'work.selected',
      }),
      createSection({
        id: 'capabilities',
        scene: 'capability.grid',
        theme: { surface: 'inverse' },
        groups: c.capabilityGroups || [],
        contentRef: c.capabilityRef || 'home.capabilities',
      }),
    ],
  };
}

/**
 * Work page: editorial/scroll hero → product demos → stack → interactive stage.
 */
export function createWorkPreset(content = {}) {
  const c = content;
  return {
    id: c.id || 'work',
    theme: c.theme || 'inneranimal',
    routes: { ...DEFAULT_ROUTES, ...(c.routes || {}) },
    shell: createShellContent({
      header: 'adaptive',
      footer: 'default',
      filterRail: c.filterRail !== false,
      ...(c.shell || {}),
    }),
    sections: [
      createSection({
        id: 'intro',
        scene: c.heroScene || 'hero.scroll-product',
        visual: c.visual || 'visual.orbital-field',
        theme: c.heroTone === 'canvas'
          ? { surface: 'canvas', headerTone: 'light' }
          : { surface: 'inverse', headerTone: 'auto' },
        scroll: c.heroTone === 'canvas'
          ? SCROLL_PRESETS.viewport
          : { ...SCROLL_PRESETS['sticky-story'], length: 210 },
        groups: c.heroGroups || [],
        contentRef: c.heroRef || 'work.hero',
      }),
      createSection({
        id: 'agentsam',
        scene: 'product.demo',
        demo: 'agentsam-mini-composer',
        theme: { surface: 'inverse' },
        scroll: SCROLL_PRESETS['sticky-story'],
        groups: c.agentsamGroups || [],
        contentRef: 'products.agentsam',
      }),
      createSection({
        id: 'products',
        scene: 'product.stack',
        theme: { surface: 'canvas' },
        groups: c.productGroups || [],
        contentRef: 'products.featured',
      }),
      createSection({
        id: 'database',
        scene: 'product.demo',
        demo: 'database-editor',
        theme: { surface: 'canvas' },
        scroll: SCROLL_PRESETS.linger,
        groups: c.databaseGroups || [],
        contentRef: 'products.database',
      }),
      createSection({
        id: 'interactive',
        scene: 'interactive.stage',
        demo: 'generic-iframe',
        visual: 'visual.atmosphere',
        groups: c.interactiveGroups || [],
        contentRef: 'products.interactive',
      }),
    ],
  };
}

/**
 * Product landing — single flagship demo focus.
 */
export function createProductPreset(content = {}) {
  const c = content;
  return {
    id: c.id || 'product',
    theme: c.theme || 'agentsam',
    routes: { ...DEFAULT_ROUTES, ...(c.routes || {}) },
    shell: createShellContent(c.shell || { header: 'adaptive', footer: 'compact' }),
    sections: [
      createSection({
        id: 'intro',
        scene: 'hero.editorial',
        theme: { surface: 'canvas' },
        scroll: SCROLL_PRESETS.viewport,
        groups: c.heroGroups || [],
        contentRef: c.heroRef || 'product.hero',
      }),
      createSection({
        id: 'demo',
        scene: 'product.demo',
        demo: c.demo || 'agentsam-mini-composer',
        scroll: SCROLL_PRESETS.cinematic,
        motion: { profile: 'story', intensity: 0.35 },
        groups: c.demoGroups || [],
        contentRef: c.demoRef || 'product.demo',
      }),
      createSection({
        id: 'gallery',
        scene: 'gallery.storyboard',
        groups: c.galleryGroups || [],
        contentRef: c.galleryRef || 'product.gallery',
      }),
    ],
  };
}

/**
 * Services / capabilities page.
 */
export function createServicesPreset(content = {}) {
  const c = content;
  return {
    id: c.id || 'services',
    theme: c.theme || 'inneranimal',
    routes: { ...DEFAULT_ROUTES, ...(c.routes || {}) },
    shell: createShellContent(c.shell || {}),
    sections: [
      createSection({
        id: 'intro',
        scene: 'hero.editorial',
        theme: { surface: 'canvas' },
        scroll: SCROLL_PRESETS.viewport,
        groups: c.heroGroups || [],
        contentRef: 'services.hero',
      }),
      createSection({
        id: 'capabilities',
        scene: 'capability.grid',
        theme: { surface: 'inverse' },
        groups: c.capabilityGroups || [],
        contentRef: 'services.capabilities',
      }),
      createSection({
        id: 'rail',
        scene: 'gallery.rail',
        groups: c.railGroups || [],
        contentRef: 'services.partners',
      }),
    ],
  };
}

/**
 * Brand / Create storyboard page (guideline lanes, not static PDF).
 */
export function createBrandStoryPreset(content = {}) {
  const c = content;
  return {
    id: c.id || 'brand-story',
    theme: c.theme || 'inneranimal',
    routes: { ...DEFAULT_ROUTES, ...(c.routes || {}) },
    shell: createShellContent(c.shell || {}),
    sections: [
      createSection({
        id: 'system',
        scene: 'gallery.storyboard',
        theme: { surface: 'canvas' },
        scroll: SCROLL_PRESETS.linger,
        groups: c.storyGroups || [],
        contentRef: 'brand.system',
      }),
      createSection({
        id: 'capabilities',
        scene: 'capability.grid',
        theme: { surface: 'inverse' },
        groups: c.capabilityGroups || [],
        contentRef: 'brand.capabilities',
      }),
    ],
  };
}

export const PRESET_BUILDERS = Object.freeze({
  'agency-home': createAgencyHomePreset,
  work: createWorkPreset,
  product: createProductPreset,
  services: createServicesPreset,
  'brand-story': createBrandStoryPreset,
});

export function createPreset(name, content = {}) {
  const builder = PRESET_BUILDERS[name];
  if (!builder) throw new Error(`Unknown preset: ${name}`);
  return builder(content);
}

export function listPresets() {
  return Object.keys(PRESET_BUILDERS);
}
