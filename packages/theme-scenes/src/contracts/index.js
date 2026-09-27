/**
 * Content contracts — PAGE → SECTION → GROUP → BLOCK.
 * Scenes never hardcode URLs, CDN hosts, or product copy.
 */

/** @typedef {'route'|'url'|'action'|'mailto'|'tel'} ActionTargetType */

/**
 * @typedef {object} RouteRef
 * @property {'route'} type
 * @property {string} ref  // e.g. "product.agentsam" — host resolves
 */

/**
 * @typedef {object} UrlRef
 * @property {'url'} type
 * @property {string} href
 */

/**
 * @typedef {object} ActionTarget
 * @property {ActionTargetType} type
 * @property {string} [ref]
 * @property {string} [href]
 */

/**
 * @typedef {object} MediaRef
 * @property {string} [assetRole]  // BrandPack role / asset id
 * @property {string} [provider]   // cloudflare-images | r2 | url | local
 * @property {string} [ref]
 * @property {string} [alt]
 * @property {[number, number]} [focalPoint] // 0–1
 * @property {string} [fit] // cover | contain
 */

/**
 * @typedef {object} CopyBlock
 * @property {'copy'} kind
 * @property {string} [id]
 * @property {'eyebrow'|'display'|'heading'|'body'|'caption'|'label'} [variant]
 * @property {string} [eyebrow]
 * @property {string} [title]
 * @property {string} [body]
 * @property {string[]} [bullets]
 * @property {number} [level]
 */

/**
 * @typedef {object} MediaBlock
 * @property {'media'} kind
 * @property {string} [id]
 * @property {MediaRef} media
 * @property {'image'|'video'|'model'|'svg'} [mediaKind]
 */

/**
 * @typedef {object} ActionBlock
 * @property {'action'} kind
 * @property {string} [id]
 * @property {string} label
 * @property {ActionTarget} target
 * @property {'primary'|'secondary'|'ghost'|'link'} [variant]
 */

/**
 * @typedef {object} CardItem
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [body]
 * @property {string} [tag]
 * @property {MediaRef} [media]
 * @property {ActionTarget} [target]
 * @property {string} [category]
 */

/**
 * @typedef {object} CardCollectionBlock
 * @property {'cards'} kind
 * @property {string} [id]
 * @property {CardItem[]} items
 * @property {{ strategy?: 'adaptive'|'rail'|'bento'|'stack', minWidth?: number, maxColumns?: number }} [layout]
 */

/**
 * @typedef {object} DemoBlock
 * @property {'demo'} kind
 * @property {string} [id]
 * @property {string} adapter  // e.g. agentsam-mini-composer | database-editor
 * @property {Record<string, unknown>} [props]
 * @property {'demo'|'interactive'|'static'} [mode]
 */

/**
 * @typedef {object} MetricBlock
 * @property {'metric'} kind
 * @property {string} [id]
 * @property {string} label
 * @property {string} value
 * @property {string} [hint]
 */

/**
 * @typedef {object} QuoteBlock
 * @property {'quote'} kind
 * @property {string} [id]
 * @property {string} text
 * @property {string} [attribution]
 */

/** @typedef {CopyBlock|MediaBlock|ActionBlock|CardCollectionBlock|DemoBlock|MetricBlock|QuoteBlock} ContentBlock */

/**
 * @typedef {object} SectionGroup
 * @property {string} [id]
 * @property {'stack'|'split'|'grid'|'feature'|'asymmetric'} [layout]
 * @property {ContentBlock[]} blocks
 */

/**
 * @typedef {object} SceneTheme
 * @property {'auto'|'light'|'dark'|'inverse'|'canvas'} [mode]
 * @property {'canvas'|'raised'|'inverse'|'bridge'|'transparent'} [surface]
 * @property {'primary'|'muted'|'inverse'} [text]
 * @property {'brand'|'teal'|'neutral'} [accent]
 * @property {'auto'|'light'|'dark'|'inverse'} [headerTone]
 */

/**
 * @typedef {object} ScrollStage
 * @property {number} at  // 0–1
 * @property {string} id
 */

/**
 * @typedef {object} SceneMotion
 * @property {'none'|'reveal'|'scrub'|'ken-burns'|'story'} [profile]
 * @property {number} [intensity] // 0–1
 * @property {boolean} [reducedMotionCrossfade]
 */

/**
 * @typedef {object} ScrollBehavior
 * @property {'natural'|'viewport'|'linger'|'sticky-story'|'cinematic'|'bridge'} mode
 * @property {number} [length] // vh units when not natural
 * @property {number} [pin]
 * @property {ScrollStage[]} [stages]
 */

/**
 * @typedef {object} SectionContent
 * @property {string} id
 * @property {string} scene  // SceneKind id
 * @property {SceneTheme} [theme]
 * @property {SceneMotion} [motion]
 * @property {ScrollBehavior} [scroll]
 * @property {string} [visual]  // visual primitive id
 * @property {string} [demo]    // demo adapter id
 * @property {SectionGroup[]} [groups]
 * @property {string} [contentRef] // optional external content pointer
 */

/**
 * @typedef {object} ShellContent
 * @property {'adaptive'|'minimal'|'none'} [header]
 * @property {'default'|'compact'|'none'} [footer]
 * @property {boolean} [filterRail]
 * @property {ActionTarget[]} [nav]
 * @property {MediaRef} [logo]
 * @property {MediaRef} [logoInverse]
 * @property {MediaRef} [avatar]
 */

/**
 * @typedef {object} PageContent
 * @property {string} id
 * @property {string} theme  // theme id
 * @property {ShellContent} [shell]
 * @property {SectionContent[]} sections
 * @property {Record<string, string>} [routes] // optional page-local route map
 * @property {object} [seo]
 */

export const BLOCK_KINDS = Object.freeze([
  'copy', 'media', 'action', 'cards', 'demo', 'metric', 'quote',
]);

export const SCROLL_MODES = Object.freeze([
  'natural', 'viewport', 'linger', 'sticky-story', 'cinematic', 'bridge',
]);

export const SCROLL_PRESETS = Object.freeze({
  natural: { mode: 'natural' },
  viewport: { mode: 'viewport', length: 100 },
  linger: { mode: 'linger', length: 140 },
  'sticky-story': { mode: 'sticky-story', length: 220, pin: 100 },
  cinematic: { mode: 'cinematic', length: 280, pin: 100 },
  bridge: { mode: 'bridge', length: 60 },
});

export function createCopyBlock(partial = {}) {
  return { kind: 'copy', variant: 'body', ...partial };
}

export function createMediaBlock(partial = {}) {
  return { kind: 'media', mediaKind: 'image', media: {}, ...partial };
}

export function createActionBlock(partial = {}) {
  return {
    kind: 'action',
    variant: 'primary',
    label: '',
    target: { type: 'route', ref: 'home' },
    ...partial,
  };
}

export function createCardsBlock(items = [], layout = {}) {
  return {
    kind: 'cards',
    items: Array.isArray(items) ? items : [],
    layout: {
      strategy: 'adaptive',
      minWidth: 280,
      maxColumns: 4,
      ...layout,
    },
  };
}

export function createDemoBlock(adapter, props = {}) {
  return { kind: 'demo', adapter, mode: 'demo', props };
}

/** Adaptive card composition — never invent filler cards. */
export function composeCardCollection(items = [], layout = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (list.length === 0) return null;
  const strategy = layout.strategy || 'adaptive';
  let resolved = strategy;
  if (strategy === 'adaptive') {
    if (list.length === 1) resolved = 'feature';
    else if (list.length === 2) resolved = 'split';
    else if (list.length === 3) resolved = 'asymmetric';
    else if (list.length <= 4) resolved = 'grid';
    else resolved = 'rail';
  }
  return createCardsBlock(list, { ...layout, strategy: resolved });
}

export function resolveRoute(target, routeMap = {}) {
  if (!target) return null;
  if (target.type === 'url' || target.type === 'mailto' || target.type === 'tel') {
    return target.href || null;
  }
  if (target.type === 'route') {
    return routeMap[target.ref] || null;
  }
  return null;
}

export function validatePageContent(page) {
  const errors = [];
  const warnings = [];
  if (!page?.id) errors.push({ code: 'page_id_required' });
  if (!page?.theme) warnings.push({ code: 'theme_missing', message: 'theme defaults to foundation' });
  if (!Array.isArray(page?.sections) || !page.sections.length) {
    warnings.push({ code: 'no_sections' });
  }
  for (const section of page?.sections || []) {
    if (!section.id) errors.push({ code: 'section_id_required' });
    if (!section.scene) errors.push({ code: 'scene_required', section: section.id });
    for (const group of section.groups || []) {
      for (const block of group.blocks || []) {
        if (!BLOCK_KINDS.includes(block.kind)) {
          errors.push({ code: 'unknown_block', kind: block.kind, section: section.id });
        }
        if (block.kind === 'cards' && (!block.items || !block.items.length)) {
          warnings.push({ code: 'empty_cards', section: section.id });
        }
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
