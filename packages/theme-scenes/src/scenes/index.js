/**
 * Scene kinds — reusable narrative units.
 * Source inventory (Work / Create HTML) → scene mapping lives in SCENE_ORIGIN.
 */

export const SCENE_KINDS = Object.freeze({
  'hero.editorial': {
    id: 'hero.editorial',
    label: 'Editorial Hero',
    description: 'Quiet statement + optional visual. Light/canvas tone.',
    slots: ['copy', 'actions', 'visual'],
    defaultScroll: 'viewport',
  },
  'hero.scroll-product': {
    id: 'hero.scroll-product',
    label: 'Scroll Product Hero',
    description: 'Cinematic intro with scrub-linked product/visual.',
    slots: ['copy', 'actions', 'visual', 'demo'],
    defaultScroll: 'sticky-story',
  },
  'bridge.theme': {
    id: 'bridge.theme',
    label: 'Theme Bridge',
    description: 'Narrative transition between visual worlds (light→dark).',
    slots: ['copy', 'media'],
    defaultScroll: 'bridge',
  },
  'gallery.storyboard': {
    id: 'gallery.storyboard',
    label: 'Storyboard Gallery',
    description: 'Brand/guideline lanes: mixed cards, iconography, action.',
    slots: ['copy', 'cards', 'actions'],
    defaultScroll: 'linger',
  },
  'gallery.rail': {
    id: 'gallery.rail',
    label: 'Gallery Rail',
    description: 'Asset/product rail — static, drag, snap, loop, or scroll-linked.',
    slots: ['cards', 'media'],
    defaultScroll: 'natural',
    behaviors: ['static', 'drag', 'snap', 'loop', 'scroll-linked'],
  },
  'product.demo': {
    id: 'product.demo',
    label: 'Product Demo',
    description: 'Live product surface via DemoAdapter (never a fake mockup).',
    slots: ['copy', 'demo', 'actions'],
    defaultScroll: 'sticky-story',
  },
  'product.stack': {
    id: 'product.stack',
    label: 'Product Stack',
    description: 'Staggered product/work catalog; item count drives layout.',
    slots: ['copy', 'cards'],
    defaultScroll: 'natural',
  },
  'capability.grid': {
    id: 'capability.grid',
    label: 'Capability Grid',
    description: 'Services/features bento — adaptive to card count.',
    slots: ['copy', 'cards', 'actions'],
    defaultScroll: 'natural',
  },
  'work.gallery': {
    id: 'work.gallery',
    label: 'Work Gallery',
    description: 'Selected work / case studies with optional filter rail.',
    slots: ['copy', 'cards', 'actions'],
    defaultScroll: 'natural',
  },
  'interactive.stage': {
    id: 'interactive.stage',
    label: 'Interactive Stage',
    description: '3D / game / CAD / model stage.',
    slots: ['copy', 'demo', 'visual', 'actions'],
    defaultScroll: 'viewport',
  },
});

/** Provenance: harvested Work/Create HTML → scene (do not ship as page HTML). */
export const SCENE_ORIGIN = Object.freeze({
  'sticky-glass-header': { becomes: 'shell.adaptive-header', sources: ['create', 'work-dark', 'work-light'] },
  'mobile-menu': { becomes: 'shell.mobile-navigation', sources: ['create', 'work-dark'] },
  'work-filter-rail': { becomes: 'shell.work-filter-rail', sources: ['work-dark'] },
  'hero-dark-globe': { becomes: 'hero.scroll-product', tone: 'inverse', sources: ['work-dark'] },
  'hero-light-globe': { becomes: 'hero.editorial', tone: 'canvas', visual: 'orbital', sources: ['work-light'] },
  'galaxy-atmosphere': { becomes: 'visual.atmosphere', sources: ['work-dark', 'work-light', 'create'] },
  'three-globe': { becomes: 'visual.orbital-field', sources: ['work-dark', 'work-light'] },
  'vibe-shift-transition': { becomes: 'bridge.theme', sources: ['work-light'] },
  'brand-storyboard-marquee': { becomes: 'gallery.storyboard', sources: ['create'] },
  'icon-marquee': { becomes: 'gallery.rail', behavior: 'loop', sources: ['work-dark'] },
  'service-bento': { becomes: 'capability.grid', sources: ['create'] },
  'meauxide-block': { becomes: 'product.demo', adapter: 'agentsam-mini-composer', sources: ['work-dark', 'work-light'] },
  'meauxsql-card': { becomes: 'product.demo', adapter: 'database-editor', sources: ['work-dark', 'work-light'] },
  'staggered-tools': { becomes: 'product.stack', sources: ['work-dark', 'work-light'] },
  'chess-stage': { becomes: 'interactive.stage', adapter: 'generic-iframe', sources: ['work-dark'] },
  'site-footer': { becomes: 'shell.site-footer', sources: ['create', 'work-dark', 'work-light'] },
});

export function getSceneKind(id) {
  return SCENE_KINDS[id] || null;
}

export function listSceneKinds() {
  return Object.values(SCENE_KINDS);
}

/**
 * Normalize a section against its scene contract.
 * Drops empty card groups; fills scroll defaults.
 */
export function normalizeSection(section, { scrollPresets } = {}) {
  if (!section?.scene) return section;
  const kind = SCENE_KINDS[section.scene];
  const next = { ...section };
  if (!next.scroll && kind?.defaultScroll) {
    const presets = scrollPresets || {};
    next.scroll = presets[kind.defaultScroll] || { mode: kind.defaultScroll };
  }
  if (Array.isArray(next.groups)) {
    next.groups = next.groups
      .map((g) => ({
        ...g,
        blocks: (g.blocks || []).filter((b) => {
          if (b.kind === 'cards' && (!b.items || !b.items.length)) return false;
          return true;
        }),
      }))
      .filter((g) => (g.blocks || []).length > 0);
  }
  return next;
}

export function createSection(partial) {
  return normalizeSection({
    id: partial.id || `section_${Math.random().toString(36).slice(2, 8)}`,
    scene: partial.scene,
    theme: partial.theme,
    motion: partial.motion,
    scroll: partial.scroll,
    visual: partial.visual,
    demo: partial.demo,
    groups: partial.groups || [],
    contentRef: partial.contentRef,
  });
}
