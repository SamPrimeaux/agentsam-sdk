// ../../packages/theme-scenes/package.json
var package_default = {
  name: "@inneranimalmedia/theme-scenes",
  version: "2.6.17",
  description: "Cross-product creative scene composition contracts and CMS-compatible scene runtime. Not a storefront theme.",
  type: "module",
  license: "FSL-1.1-MIT",
  engines: {
    node: ">=22"
  },
  main: "./src/index.js",
  exports: {
    ".": "./src/index.js",
    "./contracts": "./src/contracts/index.js",
    "./scenes": "./src/scenes/index.js",
    "./shell": "./src/shell/index.js",
    "./blocks": "./src/blocks/index.js",
    "./visuals": "./src/visuals/index.js",
    "./demos": "./src/demos/index.js",
    "./themes": "./src/themes/index.js",
    "./presets": "./src/presets/index.js",
    "./package.json": "./package.json",
    "./cms": "./src/cms/index.js"
  },
  files: [
    "src",
    "README.md"
  ],
  scripts: {
    test: "node --test test/*.test.mjs"
  },
  repository: {
    type: "git",
    url: "git+ssh://git@github.com/SamPrimeaux/agentsam-sdk.git",
    directory: "packages/theme-scenes"
  },
  publishConfig: {
    access: "public"
  },
  keywords: [
    "creative-scenes",
    "cms",
    "website-composition",
    "portable-renderer",
    "interactive-scenes"
  ],
  agentsam: {
    kind: "theme-runtime",
    slug: "theme-scenes",
    depends_on: [
      "@inneranimalmedia/agentsam-brand"
    ]
  }
};

// ../../packages/theme-scenes/src/scenes/index.js
var SCENE_KINDS = Object.freeze({
  "hero.editorial": {
    id: "hero.editorial",
    label: "Editorial Hero",
    description: "Quiet statement + optional visual. Light/canvas tone.",
    slots: ["copy", "actions", "visual"],
    defaultScroll: "viewport"
  },
  "hero.scroll-product": {
    id: "hero.scroll-product",
    label: "Scroll Product Hero",
    description: "Cinematic intro with scrub-linked product/visual.",
    slots: ["copy", "actions", "visual", "demo"],
    defaultScroll: "sticky-story"
  },
  "bridge.theme": {
    id: "bridge.theme",
    label: "Theme Bridge",
    description: "Narrative transition between visual worlds (light\u2192dark).",
    slots: ["copy", "media"],
    defaultScroll: "bridge"
  },
  "gallery.storyboard": {
    id: "gallery.storyboard",
    label: "Storyboard Gallery",
    description: "Brand/guideline lanes: mixed cards, iconography, action.",
    slots: ["copy", "cards", "actions"],
    defaultScroll: "linger"
  },
  "gallery.rail": {
    id: "gallery.rail",
    label: "Gallery Rail",
    description: "Asset/product rail \u2014 static, drag, snap, loop, or scroll-linked.",
    slots: ["cards", "media"],
    defaultScroll: "natural",
    behaviors: ["static", "drag", "snap", "loop", "scroll-linked"]
  },
  "product.demo": {
    id: "product.demo",
    label: "Product Demo",
    description: "Live product surface via DemoAdapter (never a fake mockup).",
    slots: ["copy", "demo", "actions"],
    defaultScroll: "sticky-story"
  },
  "product.stack": {
    id: "product.stack",
    label: "Product Stack",
    description: "Staggered product/work catalog; item count drives layout.",
    slots: ["copy", "cards"],
    defaultScroll: "natural"
  },
  "capability.grid": {
    id: "capability.grid",
    label: "Capability Grid",
    description: "Services/features bento \u2014 adaptive to card count.",
    slots: ["copy", "cards", "actions"],
    defaultScroll: "natural"
  },
  "work.gallery": {
    id: "work.gallery",
    label: "Work Gallery",
    description: "Selected work / case studies with optional filter rail.",
    slots: ["copy", "cards", "actions"],
    defaultScroll: "natural"
  },
  "interactive.stage": {
    id: "interactive.stage",
    label: "Interactive Stage",
    description: "Native .iamscene, 3D / game / CAD / model stage.",
    slots: ["copy", "demo", "visual", "actions"],
    defaultScroll: "viewport"
  }
});
var SCENE_ORIGIN = Object.freeze({
  "sticky-glass-header": { becomes: "shell.adaptive-header", sources: ["create", "work-dark", "work-light"] },
  "mobile-menu": { becomes: "shell.mobile-navigation", sources: ["create", "work-dark"] },
  "work-filter-rail": { becomes: "shell.work-filter-rail", sources: ["work-dark"] },
  "hero-dark-globe": { becomes: "hero.scroll-product", tone: "inverse", sources: ["work-dark"] },
  "hero-light-globe": { becomes: "hero.editorial", tone: "canvas", visual: "orbital", sources: ["work-light"] },
  "galaxy-atmosphere": { becomes: "visual.atmosphere", sources: ["work-dark", "work-light", "create"] },
  "three-globe": { becomes: "visual.orbital-field", sources: ["work-dark", "work-light"] },
  "vibe-shift-transition": { becomes: "bridge.theme", sources: ["work-light"] },
  "brand-storyboard-marquee": { becomes: "gallery.storyboard", sources: ["create"] },
  "icon-marquee": { becomes: "gallery.rail", behavior: "loop", sources: ["work-dark"] },
  "service-bento": { becomes: "capability.grid", sources: ["create"] },
  "meauxide-block": { becomes: "product.demo", adapter: "agentsam-mini-composer", sources: ["work-dark", "work-light"] },
  "meauxsql-card": { becomes: "product.demo", adapter: "database-editor", sources: ["work-dark", "work-light"] },
  "staggered-tools": { becomes: "product.stack", sources: ["work-dark", "work-light"] },
  "chess-stage": { becomes: "interactive.stage", adapter: "generic-iframe", sources: ["work-dark"] },
  "site-footer": { becomes: "shell.site-footer", sources: ["create", "work-dark", "work-light"] }
});
function getSceneKind(id) {
  return SCENE_KINDS[id] || null;
}
function normalizeSection(section, { scrollPresets } = {}) {
  if (!section?.scene) return section;
  const kind = SCENE_KINDS[section.scene];
  const next = { ...section };
  if (!next.scroll && kind?.defaultScroll) {
    const presets = scrollPresets || {};
    next.scroll = presets[kind.defaultScroll] || { mode: kind.defaultScroll };
  }
  if (Array.isArray(next.groups)) {
    next.groups = next.groups.map((g) => ({
      ...g,
      blocks: (g.blocks || []).filter((b) => {
        if (b.kind === "cards" && (!b.items || !b.items.length)) return false;
        return true;
      })
    })).filter((g) => (g.blocks || []).length > 0);
  }
  return next;
}
function createSection(partial) {
  return normalizeSection({
    id: partial.id || `section_${Math.random().toString(36).slice(2, 8)}`,
    scene: partial.scene,
    theme: partial.theme,
    motion: partial.motion,
    scroll: partial.scroll,
    visual: partial.visual,
    demo: partial.demo,
    sceneDocument: partial.sceneDocument,
    sceneAnimation: partial.sceneAnimation,
    groups: partial.groups || [],
    contentRef: partial.contentRef
  });
}

// ../../packages/theme-scenes/src/contracts/index.js
var BLOCK_KINDS = Object.freeze([
  "copy",
  "media",
  "action",
  "cards",
  "demo",
  "metric",
  "quote"
]);
var SCROLL_MODES = Object.freeze([
  "natural",
  "viewport",
  "linger",
  "sticky-story",
  "cinematic",
  "bridge"
]);
var SCROLL_PRESETS = Object.freeze({
  natural: { mode: "natural" },
  viewport: { mode: "viewport", length: 100 },
  linger: { mode: "linger", length: 140 },
  "sticky-story": { mode: "sticky-story", length: 220, pin: 100 },
  cinematic: { mode: "cinematic", length: 280, pin: 100 },
  bridge: { mode: "bridge", length: 60 }
});
function createCopyBlock(partial = {}) {
  return { kind: "copy", variant: "body", ...partial };
}
function createMediaBlock(partial = {}) {
  return { kind: "media", mediaKind: "image", media: {}, ...partial };
}
function createActionBlock(partial = {}) {
  return {
    kind: "action",
    variant: "primary",
    label: "",
    target: { type: "route", ref: "home" },
    ...partial
  };
}
function createCardsBlock(items = [], layout = {}) {
  return {
    kind: "cards",
    items: Array.isArray(items) ? items : [],
    layout: {
      strategy: "adaptive",
      minWidth: 280,
      maxColumns: 4,
      ...layout
    }
  };
}
function createDemoBlock(adapter, props = {}) {
  return { kind: "demo", adapter, mode: "demo", props };
}
function resolveRoute(target, routeMap = {}) {
  if (!target) return null;
  if (target.type === "url" || target.type === "mailto" || target.type === "tel") {
    return target.href || null;
  }
  if (target.type === "route") {
    return routeMap[target.ref] || null;
  }
  return null;
}
function validatePageContent(page) {
  const errors = [];
  const warnings = [];
  if (!page?.id) errors.push({ code: "page_id_required" });
  if (!page?.theme) warnings.push({ code: "theme_missing", message: "theme defaults to foundation" });
  if (!Array.isArray(page?.sections) || !page.sections.length) {
    warnings.push({ code: "no_sections" });
  }
  for (const section of page?.sections || []) {
    if (!section.id) errors.push({ code: "section_id_required" });
    if (!section.scene) errors.push({ code: "scene_required", section: section.id });
    if (section.sceneDocument != null) {
      const documentRef = section.sceneDocument;
      if (!documentRef || typeof documentRef !== "object" || Array.isArray(documentRef) || typeof documentRef.assetRole !== "string" && typeof documentRef.ref !== "string") {
        errors.push({ code: "scene_document_invalid", section: section.id });
      }
    }
    if (section.sceneAnimation != null) {
      const binding = section.sceneAnimation;
      if (!binding || typeof binding !== "object" || Array.isArray(binding)) {
        errors.push({ code: "scene_animation_invalid", section: section.id });
      } else {
        if (!section.sceneDocument) errors.push({ code: "scene_document_required", section: section.id });
        if (typeof binding.id !== "string" || !binding.id.trim()) {
          errors.push({ code: "scene_animation_id_required", section: section.id });
        }
        if (!["autoplay", "scroll", "manual"].includes(binding.playback)) {
          errors.push({ code: "scene_animation_playback_invalid", section: section.id });
        }
        if (binding.playback === "scroll" && (!section.scroll || section.scroll.mode === "natural")) {
          errors.push({ code: "scene_scroll_behavior_required", section: section.id });
        }
        const start = binding.startProgress ?? 0;
        const end = binding.endProgress ?? 1;
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 1 || end <= start) {
          errors.push({ code: "scene_animation_progress_range_invalid", section: section.id });
        }
      }
    }
    for (const group of section.groups || []) {
      for (const block of group.blocks || []) {
        if (!BLOCK_KINDS.includes(block.kind)) {
          errors.push({ code: "unknown_block", kind: block.kind, section: section.id });
        }
        if (block.kind === "cards" && (!block.items || !block.items.length)) {
          warnings.push({ code: "empty_cards", section: section.id });
        }
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

// ../../packages/theme-scenes/src/blocks/index.js
function shouldRenderBlock(block) {
  if (!block?.kind) return false;
  if (block.kind === "cards") return Array.isArray(block.items) && block.items.length > 0;
  if (block.kind === "copy") {
    return Boolean(block.title || block.body || block.eyebrow || block.bullets && block.bullets.length);
  }
  if (block.kind === "action") return Boolean(block.label);
  if (block.kind === "demo") return Boolean(block.adapter);
  if (block.kind === "media") return Boolean(block.media?.assetRole || block.media?.ref);
  return true;
}
function filterRenderableBlocks(blocks = []) {
  return blocks.filter(shouldRenderBlock);
}

// ../../packages/theme-scenes/src/themes/index.js
var FOUNDATION_THEME = Object.freeze({
  id: "foundation",
  label: "Foundation",
  description: "Neutral multi-brand base. Customer brands extend this.",
  tokens: {
    color: {
      "color.surface.canvas": { css: "--scene-surface", value: "#FFFFFF" },
      "color.surface.raised": { css: "--scene-surface-raised", value: "#F8FAFC" },
      "color.surface.inverse": { css: "--scene-surface-inverse", value: "#0F172A" },
      "color.text.primary": { css: "--scene-text", value: "#1E293B" },
      "color.text.muted": { css: "--scene-text-muted", value: "#64748B" },
      "color.text.inverse": { css: "--scene-text-inverse", value: "#F8FAFC" },
      "color.border.subtle": { css: "--scene-border", value: "#E2E8F0" },
      "color.brand.primary": { css: "--scene-accent", value: "#2563EB" },
      "color.brand.secondary": { css: "--scene-accent-secondary", value: "#1FAAAD" },
      "color.focus.ring": { css: "--scene-focus", value: "#2563EB" }
    },
    type: {
      "type.display.xl": { size: "clamp(3.5rem, 8vw, 7rem)", lineHeight: 1.05, tracking: "-0.04em" },
      "type.display.lg": { size: "clamp(2.75rem, 5vw, 5rem)", lineHeight: 1.08, tracking: "-0.03em" },
      "type.section": { size: "clamp(2rem, 3.5vw, 3.5rem)", lineHeight: 1.15, tracking: "-0.02em" },
      "type.body.lg": { size: "clamp(1.05rem, 1.3vw, 1.25rem)", lineHeight: 1.6 },
      "type.mono": { family: "ui-monospace, monospace" }
    },
    space: {
      "space.section.y.desktop": "144px",
      "space.section.y.mobile": "80px",
      "space.scene.gap": "80px",
      "space.content.max": "1280px"
    },
    motion: {
      "motion.intensity.default": 0.35,
      "motion.reveal.duration": "800ms",
      "motion.reduce": "crossfade"
    }
  }
});
var INNERANIMAL_THEME = Object.freeze({
  id: "inneranimal",
  extends: "foundation",
  label: "InnerAnimal Media",
  description: "Quiet institutional parent \u2014 navy / blue / teal discipline.",
  tokens: {
    color: {
      "color.brand.primary": { css: "--scene-accent", value: "#2563EB" },
      "color.brand.secondary": { css: "--scene-accent-secondary", value: "#1FAAAD" },
      "color.surface.inverse": { css: "--scene-surface-inverse", value: "#0F172A" },
      "color.text.primary": { css: "--scene-text", value: "#1E293B" }
    }
  }
});
var AGENTSAM_THEME = Object.freeze({
  id: "agentsam",
  extends: "inneranimal",
  label: "AgentSam",
  description: "Technical product skin on InnerAnimal spacing/type discipline.",
  tokens: {
    color: {
      "color.brand.primary": { css: "--scene-accent", value: "#4F8CFF" },
      "color.brand.secondary": { css: "--scene-accent-secondary", value: "#8FD7FF" },
      "color.surface.inverse": { css: "--scene-surface-inverse", value: "#0A0F18" },
      "color.surface.raised": { css: "--scene-surface-raised", value: "#172333" }
    }
  }
});
var AUTODIDACT_THEME = Object.freeze({
  id: "autodidact",
  extends: "inneranimal",
  label: "InnerAutodidact",
  description: "Learning surface \u2014 same grid/motion, softer accent.",
  tokens: {
    color: {
      "color.brand.primary": { css: "--scene-accent", value: "#1FAAAD" },
      "color.brand.secondary": { css: "--scene-accent-secondary", value: "#2563EB" }
    }
  }
});
var REGISTRY = Object.freeze({
  foundation: FOUNDATION_THEME,
  inneranimal: INNERANIMAL_THEME,
  agentsam: AGENTSAM_THEME,
  autodidact: AUTODIDACT_THEME
});
function resolveTheme(id) {
  const theme = REGISTRY[id];
  if (!theme) return resolveTheme("foundation");
  if (!theme.extends) {
    return structuredClone(theme);
  }
  const parent = resolveTheme(theme.extends);
  return {
    ...parent,
    ...theme,
    tokens: {
      color: { ...parent.tokens?.color, ...theme.tokens?.color },
      type: { ...parent.tokens?.type, ...theme.tokens?.type },
      space: { ...parent.tokens?.space, ...theme.tokens?.space },
      motion: { ...parent.tokens?.motion, ...theme.tokens?.motion }
    }
  };
}
function themeToCssVars(themeOrId) {
  const theme = typeof themeOrId === "string" ? resolveTheme(themeOrId) : themeOrId;
  const vars = {};
  for (const token of Object.values(theme.tokens?.color || {})) {
    if (token.css && token.value) vars[token.css] = token.value;
  }
  return vars;
}

// ../../packages/theme-scenes/src/demos/index.js
var DEMO_ADAPTERS = Object.freeze({
  "agentsam-mini-composer": {
    id: "agentsam-mini-composer",
    label: "AgentSam MiniComposer",
    description: "Real AgentSam / MiniComposer workspace with optional marketingDemoProvider.",
    product: "agentsam",
    modes: ["demo", "interactive"],
    storyStages: ["intro", "prompt", "plan", "edit", "runtime", "receipt", "exit"]
  },
  "database-editor": {
    id: "database-editor",
    label: "Database Editor",
    description: "Lightweight D1/SQLite editor preview (schema, grid, query).",
    product: "database",
    modes: ["demo", "interactive"],
    capabilities: ["schema", "query", "crud", "metrics"]
  },
  "cad-viewer": {
    id: "cad-viewer",
    label: "CAD / Model Viewer",
    description: "GLB/glTF turntable + poster; BrandPack model role.",
    product: "cad",
    modes: ["demo", "interactive"]
  },
  "generic-iframe": {
    id: "generic-iframe",
    label: "Generic Iframe",
    description: "Escape hatch for hosted demos (games, embeds). Prefer real adapters.",
    product: null,
    modes: ["static", "interactive"]
  }
});
function getDemoAdapter(id) {
  return DEMO_ADAPTERS[id] || null;
}
function createDemoHost(adapter, options2 = {}) {
  const meta = DEMO_ADAPTERS[adapter];
  if (!meta) {
    throw new Error(`Unknown demo adapter: ${adapter}`);
  }
  return {
    kind: "demo-host",
    adapter,
    mode: options2.mode || "demo",
    props: options2.props || {},
    provider: options2.provider || "marketingDemoProvider",
    meta
  };
}

// ../../packages/theme-scenes/src/visuals/index.js
var VISUAL_KINDS = Object.freeze({
  "visual.orbital-field": {
    id: "visual.orbital-field",
    label: "Orbital Field",
    description: "Three.js (or WebGL) globe / lattice; scroll can scrub rotation.",
    runtime: "webgl",
    props: ["tone", "intensity", "scrub"]
  },
  "visual.atmosphere": {
    id: "visual.atmosphere",
    label: "Atmosphere Layer",
    description: "Galaxy / stars / soft gradient bleed \u2014 optional underlay.",
    runtime: "css",
    props: ["density", "tone"]
  },
  "visual.grid-field": {
    id: "visual.grid-field",
    label: "Grid Field",
    description: "Quiet structural grid for editorial surfaces.",
    runtime: "css"
  },
  "visual.product-window": {
    id: "visual.product-window",
    label: "Product Window Frame",
    description: "Chrome frame around a DemoHost \u2014 not a fake IDE.",
    runtime: "dom",
    props: ["title", "chrome"]
  },
  "visual.iam-scene": {
    id: "visual.iam-scene",
    label: "Native IAM Scene",
    description: "Portable .iamscene.json rendered by the AgentSam scene runtime; supports scroll scrubbing.",
    runtime: "iamscene",
    props: ["sceneDocument", "animationId", "playback"]
  }
});
function getVisual(id) {
  return VISUAL_KINDS[id] || null;
}

// ../../packages/theme-scenes/src/runtime/compile.js
function compilePage(page, options2 = {}) {
  const validation = validatePageContent(page);
  const theme = resolveTheme(page?.theme || "foundation");
  const routes = { ...options2.routes || {}, ...page?.routes || {} };
  const cssVars = themeToCssVars(theme);
  const sections = (page?.sections || []).map((raw) => {
    const section = normalizeSection(raw, { scrollPresets: SCROLL_PRESETS });
    const kind = getSceneKind(section.scene);
    const groups = (section.groups || []).map((g) => ({
      ...g,
      blocks: filterRenderableBlocks(g.blocks || []).map((block) => enrichBlock(block, routes))
    })).filter((g) => g.blocks.length > 0);
    let demoHost = null;
    if (section.demo) {
      try {
        demoHost = createDemoHost(section.demo, { mode: "demo" });
      } catch {
        demoHost = null;
      }
    }
    const sceneDocument = section.sceneDocument ? resolveMedia(section.sceneDocument, options2.resolveAsset) : null;
    const sceneHost = sceneDocument ? {
      kind: "iamscene",
      document: sceneDocument,
      animation: section.sceneAnimation || null,
      scroll: section.sceneAnimation?.playback === "scroll" ? section.scroll || null : null
    } : null;
    return {
      ...section,
      groups,
      sceneMeta: kind,
      visualMeta: section.visual ? getVisual(section.visual) : null,
      sceneHost,
      demoHost,
      adapterMeta: section.demo ? getDemoAdapter(section.demo) : null
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
    seo: page?.seo || null
  };
}
function enrichBlock(block, routes) {
  if (block.kind === "action") {
    return {
      ...block,
      href: resolveRoute(block.target, routes)
    };
  }
  if (block.kind === "cards") {
    return {
      ...block,
      items: (block.items || []).map((item) => ({
        ...item,
        href: item.target ? resolveRoute(item.target, routes) : null
      }))
    };
  }
  return block;
}
function resolveMedia(media, resolveAsset) {
  if (!media) return null;
  if (media.assetRole && typeof resolveAsset === "function") {
    const url = resolveAsset(media.assetRole);
    return { ...media, url: url || null };
  }
  if (media.ref && media.provider === "url") {
    return { ...media, url: media.ref };
  }
  return { ...media, url: media.ref || null };
}

// ../../packages/theme-scenes/src/cms/runtime.js
var CMS_SCENE_RENDERER_PREFIX = "theme-scenes/";
var CMS_SCENE_CONTENT_SCHEMA = "agentsam.cms.scene-section.v1";
var CMS_SCENE_DEFINITION_VERSION = "1.0.0";
var CMS_SCENE_PACKAGE_NAME = package_default.name;
var CMS_SCENE_PACKAGE_VERSION = package_default.version;
var THEME_OPTIONS = ["foundation", "inneranimal", "agentsam", "autodidact"];
var SURFACE_OPTIONS = ["canvas", "raised", "inverse", "bridge", "transparent"];
var PLAYBACK_OPTIONS = ["autoplay", "scroll", "manual"];
var BLOCK_OPTIONS = ["copy", "media", "action", "card", "quote", "metric", "demo"];
var MEDIA_OPTIONS = ["image", "video", "model", "svg"];
var VISUAL_IDS = Object.keys(VISUAL_KINDS);
var safeUrl = (value) => typeof value === "string" && value.length <= 2048 && /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(value) && !/^(?:javascript|data|vbscript):/i.test(value);
var escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
var attr = escapeHtml;
var field = (key, label, type = "text", options2) => ({
  key,
  label,
  type,
  ...options2 ? { options: options2 } : {}
});
var options = (values) => values.map((value) => ({
  label: value.replaceAll("-", " ").replaceAll(".", " \xB7 "),
  value
}));
var sceneBlock = Object.freeze({
  key: "scene-content",
  label: "Scene content",
  repeatable: true,
  min: 0,
  max: 16,
  fields: [
    field("kind", "Content type", "select", options(BLOCK_OPTIONS)),
    field("variant", "Style", "select", options(["body", "eyebrow", "display", "heading", "caption", "primary", "secondary", "ghost", "link"])),
    field("eyebrow", "Eyebrow"),
    field("title", "Heading"),
    field("body", "Description", "textarea"),
    field("label", "Label"),
    field("href", "Destination", "link"),
    field("mediaUrl", "Media", "media"),
    field("mediaAlt", "Media description"),
    field("mediaKind", "Media type", "select", options(MEDIA_OPTIONS)),
    field("tag", "Tag"),
    field("category", "Category"),
    field("value", "Metric value"),
    field("hint", "Supporting detail"),
    field("attribution", "Attribution"),
    field("adapter", "Demo adapter")
  ]
});
var baseFields = Object.freeze([
  field("sceneTheme", "Scene token family", "select", options(THEME_OPTIONS)),
  field("surfaceTone", "Surface", "select", options(SURFACE_OPTIONS)),
  field("eyebrow", "Eyebrow"),
  field("headline", "Heading"),
  field("body", "Description", "textarea"),
  field("mediaUrl", "Primary media", "media"),
  field("mediaAlt", "Media description"),
  field("ctaLabel", "Action label"),
  field("ctaHref", "Action destination", "link"),
  field("scrollMode", "Scroll behavior", "select", options(SCROLL_MODES)),
  field("visual", "Visual treatment", "select", options(VISUAL_IDS)),
  field("demoAdapter", "Product demo adapter"),
  field("sceneDocumentUrl", "Interactive .iamscene document", "media"),
  field("sceneDocumentAlt", "Interactive scene description"),
  field("sceneAnimationId", "Scene animation ID"),
  field("sceneAnimationPlayback", "Scene playback", "select", options(PLAYBACK_OPTIONS))
]);
var slug = (sceneKind) => sceneKind.replaceAll(".", "-");
var rendererKeyFor = (sceneKind) => CMS_SCENE_RENDERER_PREFIX + slug(sceneKind);
var definitionKeyFor = (sceneKind) => "theme-scene-" + slug(sceneKind);
var skuFor = (sceneKind) => "SEC-THEME-SCENES-" + slug(sceneKind).toUpperCase();
var definitionIdFor = (sceneKind) => "cmsd_" + definitionKeyFor(sceneKind).replaceAll("-", "_");
var templateIdFor = (sceneKind) => "cmt_" + definitionKeyFor(sceneKind).replaceAll("-", "_");
var definitions = Object.freeze(Object.values(SCENE_KINDS).map((scene) => {
  const id = rendererKeyFor(scene.id);
  return Object.freeze({
    id,
    rendererKey: id,
    sceneKind: scene.id,
    label: scene.label,
    description: scene.description,
    family: "scene",
    type: "scene",
    source: "theme-scenes",
    templateKey: "portable",
    preset: id,
    sku: skuFor(scene.id),
    definitionId: definitionIdFor(scene.id),
    definitionKey: definitionKeyFor(scene.id),
    definitionVersion: CMS_SCENE_DEFINITION_VERSION,
    templateId: templateIdFor(scene.id),
    category: "Creative Scenes",
    defaultScroll: scene.defaultScroll,
    fields: baseFields,
    blocks: [sceneBlock],
    maxBlocks: sceneBlock.max
  });
}));
var byId = new Map(definitions.map((definition) => [definition.id, definition]));
var bySceneKind = new Map(definitions.map((definition) => [definition.sceneKind, definition]));
function createDefaultContent(id) {
  const definition = byId.get(id);
  if (!definition) return null;
  return {
    schema: CMS_SCENE_CONTENT_SCHEMA,
    sceneTheme: "foundation",
    surfaceTone: "canvas",
    eyebrow: "",
    headline: "",
    body: "",
    mediaUrl: "",
    mediaAlt: "",
    ctaLabel: "",
    ctaHref: "",
    scrollMode: definition.defaultScroll,
    visual: "",
    demoAdapter: "",
    sceneDocumentUrl: "",
    sceneDocumentAlt: "",
    sceneAnimationId: "",
    sceneAnimationPlayback: "autoplay",
    sceneDefinition: {
      id: "scene",
      scene: definition.sceneKind,
      groups: []
    },
    __editor: {
      templateKey: "portable",
      themePreset: id,
      blocks: []
    }
  };
}
function blockValues(content, editorBlock) {
  const values = content?.[editorBlock.id];
  return values && typeof values === "object" && !Array.isArray(values) ? values : {};
}
function editorBlocksToContent(content) {
  const editor = content?.__editor || {};
  const blocks = Array.isArray(editor.blocks) ? editor.blocks : [];
  const output = [];
  const cardItems = [];
  for (const editorBlock of blocks) {
    const values = blockValues(content, editorBlock);
    switch (values.kind) {
      case "copy":
        output.push(createCopyBlock({
          variant: values.variant || "body",
          eyebrow: values.eyebrow || void 0,
          title: values.title || void 0,
          body: values.body || void 0
        }));
        break;
      case "media":
        if (values.mediaUrl) output.push(createMediaBlock({
          mediaKind: values.mediaKind || "image",
          media: { provider: "url", ref: values.mediaUrl, alt: values.mediaAlt || "" }
        }));
        break;
      case "action":
        if (values.label && values.href) output.push(createActionBlock({
          label: values.label,
          variant: values.variant || "primary",
          target: { type: "url", href: values.href }
        }));
        break;
      case "card":
        cardItems.push({
          title: values.title || values.label || "",
          body: values.body || "",
          tag: values.tag || "",
          category: values.category || "",
          ...values.mediaUrl ? { media: { provider: "url", ref: values.mediaUrl, alt: values.mediaAlt || "" } } : {},
          ...values.href ? { target: { type: "url", href: values.href } } : {}
        });
        break;
      case "quote":
        if (values.body) output.push({ kind: "quote", text: values.body, attribution: values.attribution || "" });
        break;
      case "metric":
        if (values.label || values.value) output.push({
          kind: "metric",
          label: values.label || "",
          value: values.value || "",
          hint: values.hint || ""
        });
        break;
      case "demo":
        if (values.adapter && getDemoAdapter(values.adapter)) output.push(createDemoBlock(values.adapter));
        break;
      default:
        break;
    }
  }
  if (cardItems.length) output.push(createCardsBlock(cardItems));
  return output;
}
function buildSceneSection(id, content, sectionId = "scene") {
  const definition = byId.get(id);
  if (!definition) return null;
  const original = content.sceneDefinition && typeof content.sceneDefinition === "object" && !Array.isArray(content.sceneDefinition) ? structuredClone(content.sceneDefinition) : {};
  const section = {
    ...original,
    id: String(original.id || sectionId),
    scene: definition.sceneKind,
    groups: Array.isArray(original.groups) ? original.groups.map((group) => ({ ...group })) : []
  };
  const blocks = [];
  if (content.eyebrow || content.headline || content.body) {
    blocks.push(createCopyBlock({
      variant: "heading",
      eyebrow: content.eyebrow || void 0,
      title: content.headline || void 0,
      body: content.body || void 0
    }));
  }
  if (content.mediaUrl) blocks.push(createMediaBlock({
    mediaKind: "image",
    media: { provider: "url", ref: content.mediaUrl, alt: content.mediaAlt || "" }
  }));
  if (content.ctaLabel && content.ctaHref) blocks.push(createActionBlock({
    label: content.ctaLabel,
    target: { type: "url", href: content.ctaHref }
  }));
  blocks.push(...editorBlocksToContent(content));
  if (blocks.length) section.groups = [{ id: "cms-content", layout: "stack", blocks }, ...section.groups];
  if (content.scrollMode && SCROLL_PRESETS[content.scrollMode]) {
    section.scroll = { ...SCROLL_PRESETS[content.scrollMode] };
  }
  if (content.surfaceTone && SURFACE_OPTIONS.includes(content.surfaceTone)) {
    section.theme = { ...section.theme || {}, surface: content.surfaceTone };
  }
  if (content.visual && VISUAL_IDS.includes(content.visual)) section.visual = content.visual;
  if (content.demoAdapter && getDemoAdapter(content.demoAdapter)) section.demo = content.demoAdapter;
  if (content.sceneDocumentUrl) {
    section.sceneDocument = {
      provider: "url",
      ref: content.sceneDocumentUrl,
      alt: content.sceneDocumentAlt || ""
    };
  }
  if (content.sceneAnimationId) {
    section.sceneAnimation = {
      id: content.sceneAnimationId,
      playback: content.sceneAnimationPlayback || "autoplay",
      startProgress: Number.isFinite(section.sceneAnimation?.startProgress) ? section.sceneAnimation.startProgress : 0,
      endProgress: Number.isFinite(section.sceneAnimation?.endProgress) ? section.sceneAnimation.endProgress : 1
    };
  }
  return section;
}
function validate(id, content) {
  const definition = byId.get(id);
  if (!definition) return { ok: false, error: "scene_renderer_unknown" };
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { ok: false, error: "scene_content_invalid" };
  }
  const editor = content.__editor;
  if (!editor || editor.themePreset !== id || editor.templateKey !== "portable") {
    return { ok: false, error: "scene_renderer_identity_invalid" };
  }
  for (const fieldDefinition of definition.fields) {
    const value = content[fieldDefinition.key];
    if (value == null || value === "") continue;
    if (typeof value !== "string" || value.length > 12e3) {
      return { ok: false, error: "scene_field_invalid:" + fieldDefinition.key };
    }
    if (["link", "media"].includes(fieldDefinition.type) && !safeUrl(value)) {
      return { ok: false, error: "scene_field_url_invalid:" + fieldDefinition.key };
    }
  }
  if (content.sceneTheme && !THEME_OPTIONS.includes(content.sceneTheme)) {
    return { ok: false, error: "scene_theme_invalid" };
  }
  if (content.surfaceTone && !SURFACE_OPTIONS.includes(content.surfaceTone)) {
    return { ok: false, error: "scene_surface_invalid" };
  }
  if (content.scrollMode && !SCROLL_MODES.includes(content.scrollMode)) {
    return { ok: false, error: "scene_scroll_mode_invalid" };
  }
  if (content.sceneAnimationPlayback && !PLAYBACK_OPTIONS.includes(content.sceneAnimationPlayback)) {
    return { ok: false, error: "scene_animation_playback_invalid" };
  }
  if (content.sceneAnimationId && !content.sceneDocumentUrl && !content.sceneDefinition?.sceneDocument) {
    return { ok: false, error: "scene_animation_document_required" };
  }
  if (content.sceneAnimationId && content.sceneAnimationPlayback === "scroll" && (content.scrollMode || definition.defaultScroll) === "natural") {
    return { ok: false, error: "scene_scroll_behavior_required" };
  }
  if (content.visual && !VISUAL_IDS.includes(content.visual)) {
    return { ok: false, error: "scene_visual_invalid" };
  }
  if (content.demoAdapter && !getDemoAdapter(content.demoAdapter)) {
    return { ok: false, error: "scene_demo_adapter_invalid" };
  }
  if (editor.blocks != null) {
    if (!Array.isArray(editor.blocks) || editor.blocks.length > definition.maxBlocks) {
      return { ok: false, error: "scene_blocks_invalid" };
    }
    const seen = /* @__PURE__ */ new Set();
    for (const block of editor.blocks) {
      if (!block || !/^[a-zA-Z0-9_-]{1,60}$/.test(block.id || "") || seen.has(block.id) || block.templateKey !== sceneBlock.key) return { ok: false, error: "scene_block_identity_invalid" };
      seen.add(block.id);
      const values = blockValues(content, block);
      for (const [key, value] of Object.entries(values)) {
        const fieldDefinition = sceneBlock.fields.find((field2) => field2.key === key);
        if (!fieldDefinition || typeof value !== "string" || value.length > 12e3) {
          return { ok: false, error: "scene_block_field_invalid:" + key };
        }
        if (["link", "media"].includes(fieldDefinition.type) && value && !safeUrl(value)) {
          return { ok: false, error: "scene_block_url_invalid:" + key };
        }
        if (key === "kind" && value && !BLOCK_OPTIONS.includes(value)) {
          return { ok: false, error: "scene_block_kind_invalid" };
        }
        if (key === "mediaKind" && value && !MEDIA_OPTIONS.includes(value)) {
          return { ok: false, error: "scene_block_media_kind_invalid" };
        }
        if (key === "adapter" && value && !getDemoAdapter(value)) {
          return { ok: false, error: "scene_block_demo_adapter_invalid" };
        }
      }
    }
  }
  const scene = buildSceneSection(id, content);
  const validation = compilePage({
    id: "cms-scene-validation",
    theme: content.sceneTheme || "foundation",
    sections: [scene]
  }).validation;
  if (!validation.ok) return { ok: false, error: "scene_definition_invalid", details: validation.errors };
  return { ok: true };
}
function renderBlock(block) {
  if (block.kind === "copy") {
    const eyebrow = block.eyebrow ? `<p class="iam-theme-scene__eyebrow">${escapeHtml(block.eyebrow)}</p>` : "";
    const title = block.title ? `<h2>${escapeHtml(block.title)}</h2>` : "";
    const body = block.body ? `<p>${escapeHtml(block.body)}</p>` : "";
    const bullets = Array.isArray(block.bullets) && block.bullets.length ? `<ul>${block.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
    return `<div class="iam-theme-scene__copy iam-theme-scene__copy--${attr(block.variant || "body")}">${eyebrow}${title}${body}${bullets}</div>`;
  }
  if (block.kind === "media") {
    const url = block.media?.url || block.media?.ref || "";
    if (!safeUrl(url)) return "";
    const alt = block.media?.alt || "";
    if (block.mediaKind === "video") return `<figure class="iam-theme-scene__media"><video controls preload="metadata" src="${attr(url)}"></video>${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ""}</figure>`;
    if (block.mediaKind === "model") return `<div class="iam-theme-scene__model" data-scene-model-src="${attr(url)}" aria-label="${attr(alt || "Interactive 3D model")}"></div>`;
    return `<figure class="iam-theme-scene__media"><img loading="lazy" src="${attr(url)}" alt="${attr(alt)}">${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ""}</figure>`;
  }
  if (block.kind === "action") {
    if (!safeUrl(block.href)) return "";
    return `<a class="iam-theme-scene__action iam-theme-scene__action--${attr(block.variant || "primary")}" href="${attr(block.href)}">${escapeHtml(block.label || "Explore")}</a>`;
  }
  if (block.kind === "cards") {
    const items = (block.items || []).map((item) => {
      const mediaUrl = item.media?.url || item.media?.ref || "";
      const media = safeUrl(mediaUrl) ? `<img loading="lazy" src="${attr(mediaUrl)}" alt="${attr(item.media?.alt || "")}">` : "";
      const title = item.title ? `<h3>${escapeHtml(item.title)}</h3>` : "";
      const body = item.body ? `<p>${escapeHtml(item.body)}</p>` : "";
      const tag = item.tag || item.category ? `<span class="iam-theme-scene__tag">${escapeHtml(item.tag || item.category)}</span>` : "";
      const content = `${media}${tag}${title}${body}`;
      return safeUrl(item.href) ? `<a class="iam-theme-scene__card" href="${attr(item.href)}">${content}</a>` : `<article class="iam-theme-scene__card">${content}</article>`;
    }).join("");
    return items ? `<div class="iam-theme-scene__cards iam-theme-scene__cards--${attr(block.layout?.strategy || "adaptive")}">${items}</div>` : "";
  }
  if (block.kind === "demo") {
    const adapter = getDemoAdapter(block.adapter);
    if (!adapter) return "";
    return `<div class="iam-theme-scene__demo" data-scene-demo-adapter="${attr(block.adapter)}" data-scene-demo-mode="${attr(block.mode || "demo")}" role="group" aria-label="${attr(adapter.label || "Interactive product demo")}"></div>`;
  }
  if (block.kind === "metric") {
    return `<div class="iam-theme-scene__metric"><strong>${escapeHtml(block.value || "")}</strong><span>${escapeHtml(block.label || "")}</span>${block.hint ? `<small>${escapeHtml(block.hint)}</small>` : ""}</div>`;
  }
  if (block.kind === "quote") {
    return `<blockquote class="iam-theme-scene__quote"><p>${escapeHtml(block.text || "")}</p>${block.attribution ? `<cite>${escapeHtml(block.attribution)}</cite>` : ""}</blockquote>`;
  }
  return "";
}
function renderSceneHost(sceneHost, section) {
  if (!sceneHost) return "";
  const documentRef = sceneHost.document || {};
  const url = documentRef.url || documentRef.ref || "";
  const role = documentRef.assetRole || "";
  if (!safeUrl(url) && !role) return "";
  const animation = sceneHost.animation || {};
  const startProgress = Number.isFinite(animation.startProgress) ? animation.startProgress : 0;
  const endProgress = Number.isFinite(animation.endProgress) ? animation.endProgress : 1;
  return `<div class="iam-theme-scene__stage" data-iam-scene-document="${attr(url)}"${role ? ` data-iam-scene-asset-role="${attr(role)}"` : ""}${animation.id ? ` data-iam-scene-animation="${attr(animation.id)}"` : ""}${animation.playback ? ` data-iam-scene-playback="${attr(animation.playback)}"` : ""} data-iam-scene-start-progress="${startProgress}" data-iam-scene-end-progress="${endProgress}" data-scene-scroll-mode="${attr(section.scroll?.mode || "natural")}" role="img" aria-label="${attr(documentRef.alt || "Interactive scene")}"><span class="iam-theme-scene__stage-fallback">Interactive scene</span></div>`;
}
function render({ key, content }, options2 = {}) {
  const id = content?.__editor?.themePreset;
  if (!validate(id, content).ok) return null;
  const definition = byId.get(id);
  const scene = buildSceneSection(id, content, key || "scene");
  const plan = compilePage({
    id: "cms-scene-render",
    theme: content.sceneTheme || "foundation",
    sections: [scene]
  }, options2);
  const section = plan.sections[0];
  const groups = (section.groups || []).map((group) => {
    const blocks = (group.blocks || []).map(renderBlock).join("");
    return blocks ? `<div class="iam-theme-scene__group iam-theme-scene__group--${attr(group.layout || "stack")}">${blocks}</div>` : "";
  }).join("");
  const visual = section.visualMeta ? `<div class="iam-theme-scene__visual" data-scene-visual="${attr(section.visualMeta.id)}" aria-hidden="true"></div>` : "";
  const demo = section.demoHost && !section.groups.some((group) => group.blocks.some((block) => block.kind === "demo")) ? `<div class="iam-theme-scene__demo" data-scene-demo-adapter="${attr(section.demoHost.adapter)}" role="group" aria-label="Interactive product demo"></div>` : "";
  const stage = renderSceneHost(section.sceneHost, section);
  const sceneKind = definition.sceneKind;
  return `<section data-cms-section="${attr(key || scene.id)}" data-scene-kind="${attr(sceneKind)}" data-scene-scroll="${attr(section.scroll?.mode || "natural")}" class="iam-theme-scene iam-theme-scene--${attr(slug(sceneKind))}" aria-label="${attr(definition.label)}"><div class="iam-theme-scene__inner">${visual}${groups}${stage}${demo}</div></section>`;
}
var THEME_SCENES_CMS_STYLES = `
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
var ThemeScenesSections = Object.freeze({
  definitions,
  styles: THEME_SCENES_CMS_STYLES,
  get: (id) => byId.get(id) || null,
  catalog: () => definitions.map(({ id, label, family, source, templateKey, preset, rendererKey, sceneKind, sku, definitionId, definitionKey, definitionVersion, templateId, category }) => ({
    id,
    label,
    type: family,
    source,
    templateKey,
    preset,
    rendererKey,
    sceneKind,
    sku,
    definitionId,
    definitionKey,
    definitionVersion,
    templateId,
    category
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
      guardrails: { maxBlocks: definition.maxBlocks }
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
      defaultContent: createDefaultContent(id)
    };
  },
  rendererKeyFor: (sceneKind) => bySceneKind.get(sceneKind)?.id || null,
  definitionForScene: (sceneKind) => bySceneKind.get(sceneKind) || null
});
function compileCmsSceneContent(id, content, options2 = {}) {
  if (!validate(id, content).ok) throw new Error("cms_scene_content_invalid");
  const section = buildSceneSection(id, content, options2.sectionId || "scene");
  return compilePage({
    id: options2.pageId || "cms-scene",
    theme: content.sceneTheme || options2.theme || "foundation",
    routes: options2.routes || {},
    sections: [section]
  }, options2);
}

// ../../packages/theme-scenes/src/shell/index.js
var SHELL_KINDS = Object.freeze({
  "shell.adaptive-header": {
    id: "shell.adaptive-header",
    label: "Adaptive Header",
    description: "Glass sticky header; tone follows scene headerTone / scroll.",
    props: ["logo", "logoInverse", "nav", "avatar", "height"]
  },
  "shell.mobile-navigation": {
    id: "shell.mobile-navigation",
    label: "Mobile Navigation",
    description: "Full-screen overlay nav driven by shell.nav."
  },
  "shell.work-filter-rail": {
    id: "shell.work-filter-rail",
    label: "Work Filter Rail",
    description: "Optional sticky category filter for work/product galleries.",
    props: ["filters", "active"]
  },
  "shell.site-footer": {
    id: "shell.site-footer",
    label: "Site Footer",
    description: "Data-driven columns; no hardcoded product links.",
    props: ["brand", "columns", "legal", "version"]
  }
});
function createShellContent(partial = {}) {
  return {
    header: partial.header ?? "adaptive",
    footer: partial.footer ?? "default",
    filterRail: Boolean(partial.filterRail),
    nav: Array.isArray(partial.nav) ? partial.nav : [],
    logo: partial.logo || null,
    logoInverse: partial.logoInverse || null,
    avatar: partial.avatar || null,
    footerColumns: partial.footerColumns || [],
    tagline: partial.tagline || null
  };
}

// ../../packages/theme-scenes/src/presets/index.js
var DEFAULT_ROUTES = Object.freeze({
  home: "/",
  "work.index": "/work",
  about: "/about",
  services: "/services",
  contact: "/contact",
  "product.agentsam": "/agentsam",
  "product.database": "/database",
  "product.cad": "/cad",
  "product.cloud": "/cloud",
  learn: "/learn"
});
function createAgencyHomePreset(content = {}) {
  const c = content;
  return {
    id: c.id || "agency-home",
    theme: c.theme || "inneranimal",
    routes: { ...DEFAULT_ROUTES, ...c.routes || {} },
    shell: createShellContent(c.shell || { header: "adaptive", footer: "default" }),
    sections: [
      createSection({
        id: "intro",
        scene: "hero.scroll-product",
        visual: "visual.orbital-field",
        theme: { surface: "inverse", headerTone: "auto" },
        scroll: { ...SCROLL_PRESETS["sticky-story"], length: 210 },
        motion: { profile: "story", intensity: 0.34 },
        groups: c.heroGroups || [],
        contentRef: c.heroRef || "home.hero"
      }),
      createSection({
        id: "flagship-demo",
        scene: "product.demo",
        demo: "agentsam-mini-composer",
        theme: { surface: "inverse" },
        scroll: SCROLL_PRESETS["sticky-story"],
        groups: c.demoGroups || [],
        contentRef: c.demoRef || "products.agentsam"
      }),
      createSection({
        id: "bridge",
        scene: "bridge.theme",
        scroll: SCROLL_PRESETS.bridge,
        groups: c.bridgeGroups || [],
        contentRef: c.bridgeRef || "home.bridge"
      }),
      createSection({
        id: "selected-work",
        scene: "work.gallery",
        theme: { surface: "canvas" },
        groups: c.workGroups || [],
        contentRef: c.workRef || "work.selected"
      }),
      createSection({
        id: "capabilities",
        scene: "capability.grid",
        theme: { surface: "inverse" },
        groups: c.capabilityGroups || [],
        contentRef: c.capabilityRef || "home.capabilities"
      })
    ]
  };
}
function createWorkPreset(content = {}) {
  const c = content;
  return {
    id: c.id || "work",
    theme: c.theme || "inneranimal",
    routes: { ...DEFAULT_ROUTES, ...c.routes || {} },
    shell: createShellContent({
      header: "adaptive",
      footer: "default",
      filterRail: c.filterRail !== false,
      ...c.shell || {}
    }),
    sections: [
      createSection({
        id: "intro",
        scene: c.heroScene || "hero.scroll-product",
        visual: c.visual || "visual.orbital-field",
        theme: c.heroTone === "canvas" ? { surface: "canvas", headerTone: "light" } : { surface: "inverse", headerTone: "auto" },
        scroll: c.heroTone === "canvas" ? SCROLL_PRESETS.viewport : { ...SCROLL_PRESETS["sticky-story"], length: 210 },
        groups: c.heroGroups || [],
        contentRef: c.heroRef || "work.hero"
      }),
      createSection({
        id: "agentsam",
        scene: "product.demo",
        demo: "agentsam-mini-composer",
        theme: { surface: "inverse" },
        scroll: SCROLL_PRESETS["sticky-story"],
        groups: c.agentsamGroups || [],
        contentRef: "products.agentsam"
      }),
      createSection({
        id: "products",
        scene: "product.stack",
        theme: { surface: "canvas" },
        groups: c.productGroups || [],
        contentRef: "products.featured"
      }),
      createSection({
        id: "database",
        scene: "product.demo",
        demo: "database-editor",
        theme: { surface: "canvas" },
        scroll: SCROLL_PRESETS.linger,
        groups: c.databaseGroups || [],
        contentRef: "products.database"
      }),
      createSection({
        id: "interactive",
        scene: "interactive.stage",
        demo: "generic-iframe",
        visual: "visual.atmosphere",
        groups: c.interactiveGroups || [],
        contentRef: "products.interactive"
      })
    ]
  };
}
function createProductPreset(content = {}) {
  const c = content;
  return {
    id: c.id || "product",
    theme: c.theme || "agentsam",
    routes: { ...DEFAULT_ROUTES, ...c.routes || {} },
    shell: createShellContent(c.shell || { header: "adaptive", footer: "compact" }),
    sections: [
      createSection({
        id: "intro",
        scene: "hero.editorial",
        theme: { surface: "canvas" },
        scroll: SCROLL_PRESETS.viewport,
        groups: c.heroGroups || [],
        contentRef: c.heroRef || "product.hero"
      }),
      createSection({
        id: "demo",
        scene: "product.demo",
        demo: c.demo || "agentsam-mini-composer",
        scroll: SCROLL_PRESETS.cinematic,
        motion: { profile: "story", intensity: 0.35 },
        groups: c.demoGroups || [],
        contentRef: c.demoRef || "product.demo"
      }),
      createSection({
        id: "gallery",
        scene: "gallery.storyboard",
        groups: c.galleryGroups || [],
        contentRef: c.galleryRef || "product.gallery"
      })
    ]
  };
}
function createServicesPreset(content = {}) {
  const c = content;
  return {
    id: c.id || "services",
    theme: c.theme || "inneranimal",
    routes: { ...DEFAULT_ROUTES, ...c.routes || {} },
    shell: createShellContent(c.shell || {}),
    sections: [
      createSection({
        id: "intro",
        scene: "hero.editorial",
        theme: { surface: "canvas" },
        scroll: SCROLL_PRESETS.viewport,
        groups: c.heroGroups || [],
        contentRef: "services.hero"
      }),
      createSection({
        id: "capabilities",
        scene: "capability.grid",
        theme: { surface: "inverse" },
        groups: c.capabilityGroups || [],
        contentRef: "services.capabilities"
      }),
      createSection({
        id: "rail",
        scene: "gallery.rail",
        groups: c.railGroups || [],
        contentRef: "services.partners"
      })
    ]
  };
}
function createBrandStoryPreset(content = {}) {
  const c = content;
  return {
    id: c.id || "brand-story",
    theme: c.theme || "inneranimal",
    routes: { ...DEFAULT_ROUTES, ...c.routes || {} },
    shell: createShellContent(c.shell || {}),
    sections: [
      createSection({
        id: "system",
        scene: "gallery.storyboard",
        theme: { surface: "canvas" },
        scroll: SCROLL_PRESETS.linger,
        groups: c.storyGroups || [],
        contentRef: "brand.system"
      }),
      createSection({
        id: "capabilities",
        scene: "capability.grid",
        theme: { surface: "inverse" },
        groups: c.capabilityGroups || [],
        contentRef: "brand.capabilities"
      })
    ]
  };
}
var PRESET_BUILDERS = Object.freeze({
  "agency-home": createAgencyHomePreset,
  work: createWorkPreset,
  product: createProductPreset,
  services: createServicesPreset,
  "brand-story": createBrandStoryPreset
});

// ../../packages/theme-scenes/src/cms/adapter.js
var CMS_SCENE_SECTION_SCHEMA = CMS_SCENE_CONTENT_SCHEMA;
var CMS_SCENE_PAGE_SCHEMA = "agentsam.cms.scene-page.v1";
var CMS_SCENE_ARTIFACT_SCHEMA = "agentsam.cms.scene-artifact.v1";
var clone = (value) => structuredClone(value);
var object = (value) => value && typeof value === "object" && !Array.isArray(value);
var fail = (code, details) => ({ ok: false, error: code, ...details ? { details } : {} });
function validateSceneSection(section) {
  const result = validatePageContent({
    id: "cms-scene-section-validation",
    theme: "foundation",
    sections: [section]
  });
  return result.ok ? { ok: true, warnings: result.warnings } : fail("cms_scene_section_invalid", result.errors);
}
function createCmsSceneSection(sceneSection, {
  id = sceneSection?.id,
  key = sceneSection?.id,
  order = 0,
  status = "draft"
} = {}) {
  if (!object(sceneSection)) throw new Error("cms_scene_section_required");
  const validation = validateSceneSection(sceneSection);
  if (!validation.ok) throw new Error(validation.error);
  const definition = ThemeScenesSections.definitionForScene(sceneSection.scene);
  if (!definition) throw new Error("cms_scene_kind_not_registered");
  const content = ThemeScenesSections.defaults(definition.id);
  content.sceneDefinition = clone(sceneSection);
  content.scrollMode = sceneSection.scroll?.mode || definition.defaultScroll;
  if (sceneSection.sceneDocument?.ref) content.sceneDocumentUrl = sceneSection.sceneDocument.ref;
  if (sceneSection.sceneDocument?.alt) content.sceneDocumentAlt = sceneSection.sceneDocument.alt;
  if (sceneSection.sceneAnimation?.id) content.sceneAnimationId = sceneSection.sceneAnimation.id;
  if (sceneSection.sceneAnimation?.playback) content.sceneAnimationPlayback = sceneSection.sceneAnimation.playback;
  if (sceneSection.theme?.surface) content.surfaceTone = sceneSection.theme.surface;
  if (sceneSection.visual) content.visual = sceneSection.visual;
  if (sceneSection.demo) content.demoAdapter = sceneSection.demo;
  content.__editor = {
    ...content.__editor,
    catalogSku: definition.sku,
    definitionKey: definition.definitionKey,
    definitionVersion: definition.definitionVersion
  };
  const runtimeValidation = ThemeScenesSections.validate(definition.id, content);
  if (!runtimeValidation.ok) throw new Error(runtimeValidation.error || "cms_scene_content_invalid");
  return {
    id: id || key,
    key: key || id,
    type: "section",
    order: Number.isFinite(order) ? order : 0,
    status,
    templateSku: definition.sku,
    definitionId: definition.definitionId,
    rendererKey: definition.rendererKey,
    settings: content,
    metadata: {
      source: "theme-scenes-package",
      packageName: package_default.name,
      packageVersion: package_default.version,
      sceneKind: sceneSection.scene,
      rendererKey: definition.rendererKey
    },
    blocks: []
  };
}
function readCmsSceneSection(section) {
  const settings = section?.settings || section?.inline_content_json || section?.content || null;
  if (!object(settings)) return fail("cms_scene_section_content_missing");
  if (settings.schema !== CMS_SCENE_SECTION_SCHEMA) return fail("cms_scene_section_schema_invalid");
  const rendererKey = settings.__editor?.themePreset || section?.rendererKey || section?.renderer_key;
  const definition = ThemeScenesSections.get(rendererKey);
  if (!definition) return fail("cms_scene_renderer_unavailable");
  const validation = ThemeScenesSections.validate(rendererKey, settings);
  if (!validation.ok) return fail("cms_scene_section_content_invalid", validation.error);
  const sceneDefinition = settings.sceneDefinition;
  if (!object(sceneDefinition) || sceneDefinition.scene !== definition.sceneKind) {
    return fail("cms_scene_definition_mismatch");
  }
  return { ok: true, scene: clone(sceneDefinition), rendererKey, content: clone(settings) };
}
function createCmsScenePage(page, {
  siteId,
  status = page?.status || "draft",
  templateKey = "theme-scenes"
} = {}) {
  const validation = validatePageContent(page);
  if (!validation.ok) throw new Error("cms_scene_page_invalid");
  if (typeof siteId !== "string" || !siteId.trim()) throw new Error("cms_scene_site_required");
  const sections = page.sections.map((section, index) => createCmsSceneSection(section, {
    id: section.id,
    key: section.id,
    order: index * 10,
    status: "draft"
  }));
  return {
    authority: "cms_d1_installed",
    revision: "draft",
    page: {
      id: page.id,
      siteId,
      slug: page.slug || page.id,
      title: page.title || page.id,
      pageType: "scene",
      templateKey,
      status,
      metadata: {
        schema: CMS_SCENE_PAGE_SCHEMA,
        packageName: package_default.name,
        packageVersion: package_default.version,
        theme: page.theme || "foundation",
        shell: page.shell || null,
        routes: page.routes || {},
        seo: page.seo || null
      }
    },
    sections: sections.map((section) => ({
      id: section.id,
      key: section.key,
      type: section.type,
      order: section.order,
      status: section.status,
      settings: section.settings,
      contentObjectKey: null,
      contentVersion: 0,
      metadata: section.metadata,
      templateSku: section.templateSku,
      definitionId: section.definitionId,
      rendererKey: section.rendererKey,
      blocks: []
    }))
  };
}
function readCmsScenePage(composition) {
  const page = composition?.page;
  const metadata = page?.metadata || {};
  if (!page || page.pageType !== "scene" || metadata.schema !== CMS_SCENE_PAGE_SCHEMA) {
    return fail("cms_scene_page_contract_invalid");
  }
  const sections = [];
  for (const section of composition.sections || []) {
    const read = readCmsSceneSection(section);
    if (!read.ok) return read;
    sections.push(read.scene);
  }
  const scenePage = {
    id: page.slug || page.id,
    theme: metadata.theme || "foundation",
    shell: metadata.shell || null,
    routes: metadata.routes || {},
    seo: metadata.seo || null,
    sections
  };
  const validation = validatePageContent(scenePage);
  if (!validation.ok) return fail("cms_scene_page_content_invalid", validation.errors);
  return { ok: true, page: scenePage };
}
function compileCmsScenePage(composition, options2 = {}) {
  const read = readCmsScenePage(composition);
  if (!read.ok) throw new Error(read.error);
  return compilePage(read.page, options2);
}
function createCmsSceneArtifactManifest({
  artifactKey,
  version = package_default.version,
  page,
  metadata = {}
} = {}) {
  if (typeof artifactKey !== "string" || !/^[a-z0-9][a-z0-9._/-]{1,119}$/i.test(artifactKey)) {
    throw new Error("cms_scene_artifact_key_invalid");
  }
  if (typeof version !== "string" || !version.trim()) throw new Error("cms_scene_artifact_version_required");
  const validation = validatePageContent(page);
  if (!validation.ok) throw new Error("cms_scene_artifact_content_invalid");
  if (["accountId", "account_id", "siteId", "site_id"].some((key) => page?.[key] != null)) {
    throw new Error("cms_scene_artifact_must_be_site_independent");
  }
  return {
    schema: CMS_SCENE_ARTIFACT_SCHEMA,
    artifact_key: artifactKey,
    artifact_type: "scene",
    content_mode: "scene",
    version,
    source_kind: "package",
    source_ref: `${package_default.name}@${package_default.version}`,
    package: { name: package_default.name, version: package_default.version },
    content: {
      schema: CMS_SCENE_PAGE_SCHEMA,
      page: clone(page)
    },
    metadata: {
      portable: true,
      siteIndependent: true,
      sceneKinds: [...new Set(page.sections.map((section) => section.scene))],
      ...clone(metadata)
    }
  };
}
function validateCmsSceneArtifactManifest(manifest) {
  if (!object(manifest) || manifest.schema !== CMS_SCENE_ARTIFACT_SCHEMA || manifest.artifact_type !== "scene" || manifest.content_mode !== "scene") {
    return fail("cms_scene_artifact_contract_invalid");
  }
  if (manifest.package?.name !== package_default.name || !manifest.package?.version) {
    return fail("cms_scene_artifact_package_invalid");
  }
  if (typeof manifest.artifact_key !== "string" || typeof manifest.version !== "string") {
    return fail("cms_scene_artifact_identity_invalid");
  }
  const page = manifest.content?.page;
  if (!object(page) || ["accountId", "account_id", "siteId", "site_id"].some((key) => page[key] != null)) {
    return fail("cms_scene_artifact_site_scope_invalid");
  }
  const validation = validatePageContent(page);
  if (!validation.ok) return fail("cms_scene_artifact_content_invalid", validation.errors);
  return { ok: true, warnings: validation.warnings };
}
export {
  CMS_SCENE_ARTIFACT_SCHEMA,
  CMS_SCENE_CONTENT_SCHEMA,
  CMS_SCENE_DEFINITION_VERSION,
  CMS_SCENE_PACKAGE_NAME,
  CMS_SCENE_PACKAGE_VERSION,
  CMS_SCENE_PAGE_SCHEMA,
  CMS_SCENE_RENDERER_PREFIX,
  CMS_SCENE_SECTION_SCHEMA,
  THEME_SCENES_CMS_STYLES,
  ThemeScenesSections,
  compileCmsSceneContent,
  compileCmsScenePage,
  createCmsSceneArtifactManifest,
  createCmsScenePage,
  createCmsSceneSection,
  readCmsScenePage,
  readCmsSceneSection,
  validateCmsSceneArtifactManifest
};
