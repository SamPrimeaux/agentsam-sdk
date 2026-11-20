/**
 * CMS renderer contract for the cross-product scene vocabulary.
 *
 * This is a portable section renderer, not a storefront theme. The CMS owns
 * installation, revisions, site scoping and publication; this package owns
 * the scene schema and deterministic composition/rendering contract.
 */
import packageInfo from '../../package.json' with { type: 'json' };
import { SCENE_KINDS } from '../scenes/index.js';
import {
  SCROLL_MODES,
  SCROLL_PRESETS,
  createCopyBlock,
  createMediaBlock,
  createActionBlock,
  createCardsBlock,
  createDemoBlock,
} from '../contracts/index.js';
import { compilePage } from '../runtime/compile.js';
import { getDemoAdapter } from '../demos/index.js';
import { VISUAL_KINDS } from '../visuals/index.js';

export const CMS_SCENE_RENDERER_PREFIX = 'theme-scenes/';
export const CMS_SCENE_CONTENT_SCHEMA = 'agentsam.cms.scene-section.v1';
export const CMS_SCENE_DEFINITION_VERSION = '1.0.0';
export const CMS_SCENE_PACKAGE_NAME = packageInfo.name;
export const CMS_SCENE_PACKAGE_VERSION = packageInfo.version;

const THEME_OPTIONS = ['foundation', 'inneranimal', 'agentsam', 'autodidact'];
const SURFACE_OPTIONS = ['canvas', 'raised', 'inverse', 'bridge', 'transparent'];
const PLAYBACK_OPTIONS = ['autoplay', 'scroll', 'manual'];
const BLOCK_OPTIONS = ['copy', 'media', 'action', 'card', 'quote', 'metric', 'demo'];
const MEDIA_OPTIONS = ['image', 'video', 'model', 'svg'];
const VISUAL_IDS = Object.keys(VISUAL_KINDS);
const safeUrl = (value) => typeof value === 'string' && value.length <= 2048 &&
  (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(value)) &&
  !/^(?:javascript|data|vbscript):/i.test(value);
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const attr = escapeHtml;
const field = (key, label, type = 'text', options) => ({
  key, label, type, ...(options ? { options } : {}),
});
const options = (values) => values.map((value) => ({
  label: value.replaceAll('-', ' ').replaceAll('.', ' · '), value,
}));

const sceneBlock = Object.freeze({
  key: 'scene-content',
  label: 'Scene content',
  repeatable: true,
  min: 0,
  max: 16,
  fields: [
    field('kind', 'Content type', 'select', options(BLOCK_OPTIONS)),
    field('variant', 'Style', 'select', options(['body', 'eyebrow', 'display', 'heading', 'caption', 'primary', 'secondary', 'ghost', 'link'])),
    field('eyebrow', 'Eyebrow'),
    field('title', 'Heading'),
    field('body', 'Description', 'textarea'),
    field('label', 'Label'),
    field('href', 'Destination', 'link'),
    field('mediaUrl', 'Media', 'media'),
    field('mediaAlt', 'Media description'),
    field('mediaKind', 'Media type', 'select', options(MEDIA_OPTIONS)),
    field('tag', 'Tag'),
    field('category', 'Category'),
    field('value', 'Metric value'),
    field('hint', 'Supporting detail'),
    field('attribution', 'Attribution'),
    field('adapter', 'Demo adapter'),
  ],
});

const baseFields = Object.freeze([
  field('sceneTheme', 'Scene token family', 'select', options(THEME_OPTIONS)),
  field('surfaceTone', 'Surface', 'select', options(SURFACE_OPTIONS)),
  field('eyebrow', 'Eyebrow'),
  field('headline', 'Heading'),
  field('body', 'Description', 'textarea'),
  field('mediaUrl', 'Primary media', 'media'),
  field('mediaAlt', 'Media description'),
  field('ctaLabel', 'Action label'),
  field('ctaHref', 'Action destination', 'link'),
  field('scrollMode', 'Scroll behavior', 'select', options(SCROLL_MODES)),
  field('visual', 'Visual treatment', 'select', options(VISUAL_IDS)),
  field('demoAdapter', 'Product demo adapter'),
  field('sceneDocumentUrl', 'Interactive .iamscene document', 'media'),
  field('sceneDocumentAlt', 'Interactive scene description'),
  field('sceneAnimationId', 'Scene animation ID'),
  field('sceneAnimationPlayback', 'Scene playback', 'select', options(PLAYBACK_OPTIONS)),
]);

const slug = (sceneKind) => sceneKind.replaceAll('.', '-');
const rendererKeyFor = (sceneKind) => CMS_SCENE_RENDERER_PREFIX + slug(sceneKind);
const definitionKeyFor = (sceneKind) => 'theme-scene-' + slug(sceneKind);
const skuFor = (sceneKind) => 'SEC-THEME-SCENES-' + slug(sceneKind).toUpperCase();
const definitionIdFor = (sceneKind) => 'cmsd_' + definitionKeyFor(sceneKind).replaceAll('-', '_');
const templateIdFor = (sceneKind) => 'cmt_' + definitionKeyFor(sceneKind).replaceAll('-', '_');

const definitions = Object.freeze(Object.values(SCENE_KINDS).map((scene) => {
  const id = rendererKeyFor(scene.id);
  return Object.freeze({
    id,
    rendererKey: id,
    sceneKind: scene.id,
    label: scene.label,
    description: scene.description,
    family: 'scene',
    type: 'scene',
    source: 'theme-scenes',
    templateKey: 'portable',
    preset: id,
    sku: skuFor(scene.id),
    definitionId: definitionIdFor(scene.id),
    definitionKey: definitionKeyFor(scene.id),
    definitionVersion: CMS_SCENE_DEFINITION_VERSION,
    templateId: templateIdFor(scene.id),
    category: 'Creative Scenes',
    defaultScroll: scene.defaultScroll,
    fields: baseFields,
    blocks: [sceneBlock],
    maxBlocks: sceneBlock.max,
  });
}));
const byId = new Map(definitions.map((definition) => [definition.id, definition]));
const bySceneKind = new Map(definitions.map((definition) => [definition.sceneKind, definition]));

function createDefaultContent(id) {
  const definition = byId.get(id);
  if (!definition) return null;
  return {
    schema: CMS_SCENE_CONTENT_SCHEMA,
    sceneTheme: 'foundation',
    surfaceTone: 'canvas',
    eyebrow: '',
    headline: '',
    body: '',
    mediaUrl: '',
    mediaAlt: '',
    ctaLabel: '',
    ctaHref: '',
    scrollMode: definition.defaultScroll,
    visual: '',
    demoAdapter: '',
    sceneDocumentUrl: '',
    sceneDocumentAlt: '',
    sceneAnimationId: '',
    sceneAnimationPlayback: 'autoplay',
    sceneDefinition: {
      id: 'scene',
      scene: definition.sceneKind,
      groups: [],
    },
    __editor: {
      templateKey: 'portable',
      themePreset: id,
      blocks: [],
    },
  };
}

function blockValues(content, editorBlock) {
  const values = content?.[editorBlock.id];
  return values && typeof values === 'object' && !Array.isArray(values) ? values : {};
}

function editorBlocksToContent(content) {
  const editor = content?.__editor || {};
  const blocks = Array.isArray(editor.blocks) ? editor.blocks : [];
  const output = [];
  const cardItems = [];
  for (const editorBlock of blocks) {
    const values = blockValues(content, editorBlock);
    switch (values.kind) {
      case 'copy':
        output.push(createCopyBlock({
          variant: values.variant || 'body',
          eyebrow: values.eyebrow || undefined,
          title: values.title || undefined,
          body: values.body || undefined,
        }));
        break;
      case 'media':
        if (values.mediaUrl) output.push(createMediaBlock({
          mediaKind: values.mediaKind || 'image',
          media: { provider: 'url', ref: values.mediaUrl, alt: values.mediaAlt || '' },
        }));
        break;
      case 'action':
        if (values.label && values.href) output.push(createActionBlock({
          label: values.label,
          variant: values.variant || 'primary',
          target: { type: 'url', href: values.href },
        }));
        break;
      case 'card':
        cardItems.push({
          title: values.title || values.label || '',
          body: values.body || '',
          tag: values.tag || '',
          category: values.category || '',
          ...(values.mediaUrl ? { media: { provider: 'url', ref: values.mediaUrl, alt: values.mediaAlt || '' } } : {}),
          ...(values.href ? { target: { type: 'url', href: values.href } } : {}),
        });
        break;
      case 'quote':
        if (values.body) output.push({ kind: 'quote', text: values.body, attribution: values.attribution || '' });
        break;
      case 'metric':
        if (values.label || values.value) output.push({
          kind: 'metric', label: values.label || '', value: values.value || '', hint: values.hint || '',
        });
        break;
      case 'demo':
        if (values.adapter && getDemoAdapter(values.adapter)) output.push(createDemoBlock(values.adapter));
        break;
      default:
        break;
    }
  }
  if (cardItems.length) output.push(createCardsBlock(cardItems));
  return output;
}

function buildSceneSection(id, content, sectionId = 'scene') {
  const definition = byId.get(id);
  if (!definition) return null;
  const original = content.sceneDefinition && typeof content.sceneDefinition === 'object' &&
    !Array.isArray(content.sceneDefinition) ? structuredClone(content.sceneDefinition) : {};
  const section = {
    ...original,
    id: String(original.id || sectionId),
    scene: definition.sceneKind,
    groups: Array.isArray(original.groups) ? original.groups.map((group) => ({ ...group })) : [],
  };
  const blocks = [];
  if (content.eyebrow || content.headline || content.body) {
    blocks.push(createCopyBlock({
      variant: 'heading',
      eyebrow: content.eyebrow || undefined,
      title: content.headline || undefined,
      body: content.body || undefined,
    }));
  }
  if (content.mediaUrl) blocks.push(createMediaBlock({
    mediaKind: 'image',
    media: { provider: 'url', ref: content.mediaUrl, alt: content.mediaAlt || '' },
  }));
  if (content.ctaLabel && content.ctaHref) blocks.push(createActionBlock({
    label: content.ctaLabel,
    target: { type: 'url', href: content.ctaHref },
  }));
  blocks.push(...editorBlocksToContent(content));
  if (blocks.length) section.groups = [{ id: 'cms-content', layout: 'stack', blocks }, ...section.groups];
  if (content.scrollMode && SCROLL_PRESETS[content.scrollMode]) {
    section.scroll = { ...SCROLL_PRESETS[content.scrollMode] };
  }
  if (content.surfaceTone && SURFACE_OPTIONS.includes(content.surfaceTone)) {
    section.theme = { ...(section.theme || {}), surface: content.surfaceTone };
  }
  if (content.visual && VISUAL_IDS.includes(content.visual)) section.visual = content.visual;
  if (content.demoAdapter && getDemoAdapter(content.demoAdapter)) section.demo = content.demoAdapter;
  if (content.sceneDocumentUrl) {
    section.sceneDocument = {
      provider: 'url', ref: content.sceneDocumentUrl,
      alt: content.sceneDocumentAlt || '',
    };
  }
  if (content.sceneAnimationId) {
    section.sceneAnimation = {
      id: content.sceneAnimationId,
      playback: content.sceneAnimationPlayback || 'autoplay',
      startProgress: Number.isFinite(section.sceneAnimation?.startProgress) ? section.sceneAnimation.startProgress : 0,
      endProgress: Number.isFinite(section.sceneAnimation?.endProgress) ? section.sceneAnimation.endProgress : 1,
    };
  }
  return section;
}

function validate(id, content) {
  const definition = byId.get(id);
  if (!definition) return { ok: false, error: 'scene_renderer_unknown' };
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, error: 'scene_content_invalid' };
  }
  const editor = content.__editor;
  if (!editor || editor.themePreset !== id || editor.templateKey !== 'portable') {
    return { ok: false, error: 'scene_renderer_identity_invalid' };
  }
  for (const fieldDefinition of definition.fields) {
    const value = content[fieldDefinition.key];
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || value.length > 12000) {
      return { ok: false, error: 'scene_field_invalid:' + fieldDefinition.key };
    }
    if (['link', 'media'].includes(fieldDefinition.type) && !safeUrl(value)) {
      return { ok: false, error: 'scene_field_url_invalid:' + fieldDefinition.key };
    }
  }
  if (content.sceneTheme && !THEME_OPTIONS.includes(content.sceneTheme)) {
    return { ok: false, error: 'scene_theme_invalid' };
  }
  if (content.surfaceTone && !SURFACE_OPTIONS.includes(content.surfaceTone)) {
    return { ok: false, error: 'scene_surface_invalid' };
  }
  if (content.scrollMode && !SCROLL_MODES.includes(content.scrollMode)) {
    return { ok: false, error: 'scene_scroll_mode_invalid' };
  }
  if (content.sceneAnimationPlayback && !PLAYBACK_OPTIONS.includes(content.sceneAnimationPlayback)) {
    return { ok: false, error: 'scene_animation_playback_invalid' };
  }
  if (content.sceneAnimationId && !content.sceneDocumentUrl && !content.sceneDefinition?.sceneDocument) {
    return { ok: false, error: 'scene_animation_document_required' };
  }
  if (content.sceneAnimationId && content.sceneAnimationPlayback === 'scroll' &&
      (content.scrollMode || definition.defaultScroll) === 'natural') {
    return { ok: false, error: 'scene_scroll_behavior_required' };
  }
  if (content.visual && !VISUAL_IDS.includes(content.visual)) {
    return { ok: false, error: 'scene_visual_invalid' };
  }
  if (content.demoAdapter && !getDemoAdapter(content.demoAdapter)) {
    return { ok: false, error: 'scene_demo_adapter_invalid' };
  }
  if (editor.blocks != null) {
    if (!Array.isArray(editor.blocks) || editor.blocks.length > definition.maxBlocks) {
      return { ok: false, error: 'scene_blocks_invalid' };
    }
    const seen = new Set();
    for (const block of editor.blocks) {
      if (!block || !/^[a-zA-Z0-9_-]{1,60}$/.test(block.id || '') || seen.has(block.id) ||
          block.templateKey !== sceneBlock.key) return { ok: false, error: 'scene_block_identity_invalid' };
      seen.add(block.id);
      const values = blockValues(content, block);
      for (const [key, value] of Object.entries(values)) {
        const fieldDefinition = sceneBlock.fields.find((field) => field.key === key);
        if (!fieldDefinition || typeof value !== 'string' || value.length > 12000) {
          return { ok: false, error: 'scene_block_field_invalid:' + key };
        }
        if (['link', 'media'].includes(fieldDefinition.type) && value && !safeUrl(value)) {
          return { ok: false, error: 'scene_block_url_invalid:' + key };
        }
        if (key === 'kind' && value && !BLOCK_OPTIONS.includes(value)) {
          return { ok: false, error: 'scene_block_kind_invalid' };
        }
        if (key === 'mediaKind' && value && !MEDIA_OPTIONS.includes(value)) {
          return { ok: false, error: 'scene_block_media_kind_invalid' };
        }
        if (key === 'adapter' && value && !getDemoAdapter(value)) {
          return { ok: false, error: 'scene_block_demo_adapter_invalid' };
        }
      }
    }
  }
  const scene = buildSceneSection(id, content);
  const validation = compilePage({
    id: 'cms-scene-validation',
    theme: content.sceneTheme || 'foundation',
    sections: [scene],
  }).validation;
  if (!validation.ok) return { ok: false, error: 'scene_definition_invalid', details: validation.errors };
  return { ok: true };
}

function renderBlock(block) {
  if (block.kind === 'copy') {
    const eyebrow = block.eyebrow ? `<p class="iam-theme-scene__eyebrow">${escapeHtml(block.eyebrow)}</p>` : '';
    const title = block.title ? `<h2>${escapeHtml(block.title)}</h2>` : '';
    const body = block.body ? `<p>${escapeHtml(block.body)}</p>` : '';
    const bullets = Array.isArray(block.bullets) && block.bullets.length
      ? `<ul>${block.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
    return `<div class="iam-theme-scene__copy iam-theme-scene__copy--${attr(block.variant || 'body')}">${eyebrow}${title}${body}${bullets}</div>`;
  }
  if (block.kind === 'media') {
    const url = block.media?.url || block.media?.ref || '';
    if (!safeUrl(url)) return '';
    const alt = block.media?.alt || '';
    if (block.mediaKind === 'video') return `<figure class="iam-theme-scene__media"><video controls preload="metadata" src="${attr(url)}"></video>${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ''}</figure>`;
    if (block.mediaKind === 'model') return `<div class="iam-theme-scene__model" data-scene-model-src="${attr(url)}" aria-label="${attr(alt || 'Interactive 3D model')}"></div>`;
    return `<figure class="iam-theme-scene__media"><img loading="lazy" src="${attr(url)}" alt="${attr(alt)}">${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ''}</figure>`;
  }
  if (block.kind === 'action') {
    if (!safeUrl(block.href)) return '';
    return `<a class="iam-theme-scene__action iam-theme-scene__action--${attr(block.variant || 'primary')}" href="${attr(block.href)}">${escapeHtml(block.label || 'Explore')}</a>`;
  }
  if (block.kind === 'cards') {
    const items = (block.items || []).map((item) => {
      const mediaUrl = item.media?.url || item.media?.ref || '';
      const media = safeUrl(mediaUrl) ? `<img loading="lazy" src="${attr(mediaUrl)}" alt="${attr(item.media?.alt || '')}">` : '';
      const title = item.title ? `<h3>${escapeHtml(item.title)}</h3>` : '';
      const body = item.body ? `<p>${escapeHtml(item.body)}</p>` : '';
      const tag = item.tag || item.category ? `<span class="iam-theme-scene__tag">${escapeHtml(item.tag || item.category)}</span>` : '';
      const content = `${media}${tag}${title}${body}`;
      return safeUrl(item.href) ? `<a class="iam-theme-scene__card" href="${attr(item.href)}">${content}</a>` : `<article class="iam-theme-scene__card">${content}</article>`;
    }).join('');
    return items ? `<div class="iam-theme-scene__cards iam-theme-scene__cards--${attr(block.layout?.strategy || 'adaptive')}">${items}</div>` : '';
  }
  if (block.kind === 'demo') {
    const adapter = getDemoAdapter(block.adapter);
    if (!adapter) return '';
    return `<div class="iam-theme-scene__demo" data-scene-demo-adapter="${attr(block.adapter)}" data-scene-demo-mode="${attr(block.mode || 'demo')}" role="group" aria-label="${attr(adapter.label || 'Interactive product demo')}"></div>`;
  }
  if (block.kind === 'metric') {
    return `<div class="iam-theme-scene__metric"><strong>${escapeHtml(block.value || '')}</strong><span>${escapeHtml(block.label || '')}</span>${block.hint ? `<small>${escapeHtml(block.hint)}</small>` : ''}</div>`;
  }
  if (block.kind === 'quote') {
    return `<blockquote class="iam-theme-scene__quote"><p>${escapeHtml(block.text || '')}</p>${block.attribution ? `<cite>${escapeHtml(block.attribution)}</cite>` : ''}</blockquote>`;
  }
  return '';
}

function renderSceneHost(sceneHost, section) {
  if (!sceneHost) return '';
  const documentRef = sceneHost.document || {};
  const url = documentRef.url || documentRef.ref || '';
  const role = documentRef.assetRole || '';
  if (!safeUrl(url) && !role) return '';
  const animation = sceneHost.animation || {};
  const startProgress = Number.isFinite(animation.startProgress) ? animation.startProgress : 0;
  const endProgress = Number.isFinite(animation.endProgress) ? animation.endProgress : 1;
  return `<div class="iam-theme-scene__stage" data-iam-scene-document="${attr(url)}"${role ? ` data-iam-scene-asset-role="${attr(role)}"` : ''}${animation.id ? ` data-iam-scene-animation="${attr(animation.id)}"` : ''}${animation.playback ? ` data-iam-scene-playback="${attr(animation.playback)}"` : ''} data-iam-scene-start-progress="${startProgress}" data-iam-scene-end-progress="${endProgress}" data-scene-scroll-mode="${attr(section.scroll?.mode || 'natural')}" role="img" aria-label="${attr(documentRef.alt || 'Interactive scene')}"><span class="iam-theme-scene__stage-fallback">Interactive scene</span></div>`;
}

function render({ key, content }, options = {}) {
  const id = content?.__editor?.themePreset;
  if (!validate(id, content).ok) return null;
  const definition = byId.get(id);
  const scene = buildSceneSection(id, content, key || 'scene');
  const plan = compilePage({
    id: 'cms-scene-render',
    theme: content.sceneTheme || 'foundation',
    sections: [scene],
  }, options);
  const section = plan.sections[0];
  const groups = (section.groups || []).map((group) => {
    const blocks = (group.blocks || []).map(renderBlock).join('');
    return blocks ? `<div class="iam-theme-scene__group iam-theme-scene__group--${attr(group.layout || 'stack')}">${blocks}</div>` : '';
  }).join('');
  const visual = section.visualMeta
    ? `<div class="iam-theme-scene__visual" data-scene-visual="${attr(section.visualMeta.id)}" aria-hidden="true"></div>` : '';
  const demo = section.demoHost && !section.groups.some((group) => group.blocks.some((block) => block.kind === 'demo'))
    ? `<div class="iam-theme-scene__demo" data-scene-demo-adapter="${attr(section.demoHost.adapter)}" role="group" aria-label="Interactive product demo"></div>` : '';
  const stage = renderSceneHost(section.sceneHost, section);
  const sceneKind = definition.sceneKind;
  return `<section data-cms-section="${attr(key || scene.id)}" data-scene-kind="${attr(sceneKind)}" data-scene-scroll="${attr(section.scroll?.mode || 'natural')}" class="iam-theme-scene iam-theme-scene--${attr(slug(sceneKind))}" aria-label="${attr(definition.label)}"><div class="iam-theme-scene__inner">${visual}${groups}${stage}${demo}</div></section>`;
}

export const THEME_SCENES_CMS_STYLES = `
.iam-theme-scene{position:relative;isolation:isolate;min-width:0;overflow:clip;padding:clamp(2.5rem,7vw,7rem) clamp(1rem,4vw,4rem);color:inherit;background:transparent}
.iam-theme-scene__inner{width:min(100%,80rem);margin-inline:auto;display:grid;gap:clamp(1.5rem,4vw,3.5rem);min-width:0}
.iam-theme-scene__group{display:grid;gap:clamp(1rem,2.5vw,2rem);min-width:0}
.iam-theme-scene__group--split{grid-template-columns:repeat(2,minmax(0,1fr));align-items:center}
.iam-theme-scene__group--grid,.iam-theme-scene__cards{grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr))}
.iam-theme-scene__copy{max-width:62rem;min-width:0}
.iam-theme-scene__copy h2{font-size:clamp(2rem,5vw,5.5rem);line-height:1.02;letter-spacing:-.045em;text-wrap:balance;margin:0}
.iam-theme-scene__copy p{max-width:68ch;line-height:1.65}
.iam-theme-scene__eyebrow,.iam-theme-scene__tag{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;opacity:.72}
.iam-theme-scene__media img,.iam-theme-scene__media video,.iam-theme-scene__card img{display:block;width:100%;height:auto;max-height:75vh;object-fit:cover;border-radius:var(--scene-media-radius,1rem)}
.iam-theme-scene__cards{display:grid;gap:1rem;min-width:0}
.iam-theme-scene__card{display:grid;align-content:start;gap:.75rem;min-width:0;padding:clamp(1rem,2vw,1.5rem);border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:var(--scene-card-radius,1rem);color:inherit;text-decoration:none}
.iam-theme-scene__action{display:inline-flex;align-items:center;justify-content:center;justify-self:start;min-height:2.75rem;padding:.7rem 1.1rem;border:1px solid currentColor;border-radius:999px;color:inherit;text-decoration:none}
.iam-theme-scene__stage,.iam-theme-scene__model{position:relative;min-height:clamp(18rem,52vw,42rem);width:100%;overflow:hidden;border-radius:var(--scene-stage-radius,1rem);background:var(--scene-surface-inverse,transparent)}
.iam-theme-scene__stage-fallback{position:absolute;inset:auto 1rem 1rem;color:inherit;font-size:.75rem;opacity:.72}
.iam-theme-scene__metric{display:grid;gap:.35rem}.iam-theme-scene__metric strong{font-size:clamp(2rem,5vw,4rem)}
.iam-theme-scene__quote{margin:0;padding-inline:1.25rem;border-inline-start:2px solid var(--scene-accent,currentColor);font-size:clamp(1.2rem,2vw,2rem)}
.iam-theme-scene__demo{min-height:12rem;min-width:0}
.iam-theme-scene__visual{min-height:clamp(10rem,24vw,24rem);pointer-events:none}
@media(max-width:760px){.iam-theme-scene{padding:2.5rem 1rem}.iam-theme-scene__group--split{grid-template-columns:minmax(0,1fr)}.iam-theme-scene__stage,.iam-theme-scene__model{min-height:20rem}}
@media(prefers-reduced-motion:reduce){.iam-theme-scene *{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

export const ThemeScenesSections = Object.freeze({
  definitions,
  styles: THEME_SCENES_CMS_STYLES,
  get: (id) => byId.get(id) || null,
  catalog: () => definitions.map(({ id, label, family, source, templateKey, preset, rendererKey, sceneKind, sku, definitionId, definitionKey, definitionVersion, templateId, category }) => ({
    id, label, type: family, source, templateKey, preset, rendererKey, sceneKind,
    sku, definitionId, definitionKey, definitionVersion, templateId, category,
  })),
  defaults: createDefaultContent,
  render,
  validate,
  schema(id) {
    const definition = byId.get(id);
    if (!definition) return null;
    return {
      label: definition.label,
      fields: definition.fields,
      blocks: definition.blocks,
      settings: [],
      capabilities: { edit: true, reorder: true, duplicate: true, remove: true, blocks: true, responsive: true },
      guardrails: { maxBlocks: definition.maxBlocks },
    };
  },
  sourceTemplate(id) {
    const definition = byId.get(id);
    if (!definition) return null;
    return {
      key: id,
      label: definition.label,
      rendererKey: id,
      definitionKey: definition.definitionKey,
      definitionVersion: definition.definitionVersion,
      sku: definition.sku,
      fields: definition.fields,
      blocks: definition.blocks,
      defaultContent: createDefaultContent(id),
    };
  },
  rendererKeyFor: (sceneKind) => bySceneKind.get(sceneKind)?.id || null,
  definitionForScene: (sceneKind) => bySceneKind.get(sceneKind) || null,
});

export function compileCmsSceneContent(id, content, options = {}) {
  if (!validate(id, content).ok) throw new Error('cms_scene_content_invalid');
  const section = buildSceneSection(id, content, options.sectionId || 'scene');
  return compilePage({
    id: options.pageId || 'cms-scene',
    theme: content.sceneTheme || options.theme || 'foundation',
    routes: options.routes || {},
    sections: [section],
  }, options);
}
