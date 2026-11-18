/**
 * Runtime helpers — host-agnostic. React/DOM hosts bind later.
 */

import { resolveRoute, validatePageContent, SCROLL_PRESETS } from '../contracts/index.js';
import { normalizeSection, getSceneKind } from '../scenes/index.js';
import { filterRenderableBlocks } from '../blocks/index.js';
import { resolveTheme, themeToCssVars } from '../themes/index.js';
import { getDemoAdapter, createDemoHost } from '../demos/index.js';
import { getVisual } from '../visuals/index.js';

/**
 * Compile a PageContent into a render plan (no DOM).
 */
export function compilePage(page, options = {}) {
  const validation = validatePageContent(page);
  const theme = resolveTheme(page?.theme || 'foundation');
  const routes = { ...(options.routes || {}), ...(page?.routes || {}) };
  const cssVars = themeToCssVars(theme);

  const sections = (page?.sections || []).map((raw) => {
    const section = normalizeSection(raw, { scrollPresets: SCROLL_PRESETS });
    const kind = getSceneKind(section.scene);
    const groups = (section.groups || []).map((g) => ({
      ...g,
      blocks: filterRenderableBlocks(g.blocks || []).map((block) => enrichBlock(block, routes)),
    })).filter((g) => g.blocks.length > 0);

    let demoHost = null;
    if (section.demo) {
      try {
        demoHost = createDemoHost(section.demo, { mode: 'demo' });
      } catch {
        demoHost = null;
      }
    }
    const sceneDocument = section.sceneDocument
      ? resolveMedia(section.sceneDocument, options.resolveAsset)
      : null;
    const sceneHost = sceneDocument ? {
      kind: 'iamscene',
      document: sceneDocument,
      animation: section.sceneAnimation || null,
      scroll: section.sceneAnimation?.playback === 'scroll' ? section.scroll || null : null,
    } : null;

    return {
      ...section,
      groups,
      sceneMeta: kind,
      visualMeta: section.visual ? getVisual(section.visual) : null,
      sceneHost,
      demoHost,
      adapterMeta: section.demo ? getDemoAdapter(section.demo) : null,
    };
  });

  return {
    id: page?.id,
    theme,
    cssVars,
    routes,
    shell: page?.shell || null,
    sections,
    validation,
    seo: page?.seo || null,
  };
}

function enrichBlock(block, routes) {
  if (block.kind === 'action') {
    return {
      ...block,
      href: resolveRoute(block.target, routes),
    };
  }
  if (block.kind === 'cards') {
    return {
      ...block,
      items: (block.items || []).map((item) => ({
        ...item,
        href: item.target ? resolveRoute(item.target, routes) : null,
      })),
    };
  }
  return block;
}

/**
 * Map media refs through a BrandPack / delivery resolver.
 * @param {object} media
 * @param {(role: string) => string|null} resolveAsset
 */
export function resolveMedia(media, resolveAsset) {
  if (!media) return null;
  if (media.assetRole && typeof resolveAsset === 'function') {
    const url = resolveAsset(media.assetRole);
    return { ...media, url: url || null };
  }
  if (media.ref && media.provider === 'url') {
    return { ...media, url: media.ref };
  }
  return { ...media, url: media.ref || null };
}

/**
 * Normalized scroll progress helper for hosts.
 * @param {number} scrollY
 * @param {DOMRect|object} sectionRect — { top, height }
 * @param {object} scroll — ScrollBehavior
 */
export function computeScrollProgress(scrollY, sectionRect, scroll = {}) {
  if (!sectionRect || scroll.mode === 'natural') return 0;
  const start = (sectionRect.top ?? 0) + scrollY;
  const lengthPx = ((scroll.length || 100) / 100) * (typeof window !== 'undefined' ? window.innerHeight : 800);
  const pin = ((scroll.pin || 0) / 100) * (typeof window !== 'undefined' ? window.innerHeight : 800);
  const local = scrollY - start + pin;
  if (lengthPx <= 0) return 0;
  return Math.min(1, Math.max(0, local / lengthPx));
}

/** Map normalized page progress to an exact scene animation time. */
export function sceneTimeAtProgress(progress, duration, range = {}) {
  if (!Number.isFinite(progress)) throw new Error('theme_scene_progress_invalid');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('theme_scene_duration_invalid');
  const start = range.start ?? 0;
  const end = range.end ?? 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) ||
      start < 0 || end > 1 || end <= start) {
    throw new Error('theme_scene_progress_range_invalid');
  }
  const local = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return local * duration;
}

export function stageAtProgress(progress, stages = []) {
  if (!stages.length) return null;
  let current = stages[0];
  for (const s of stages) {
    if (progress >= s.at) current = s;
  }
  return current;
}
