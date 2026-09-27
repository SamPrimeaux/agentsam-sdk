/**
 * Asset roles — semantic identity, not dimensions.
 * A 512px logo and a 512px app icon are different assets.
 */

export const ASSET_ROLES = Object.freeze({
  // Logo system
  'logo.primary': {
    family: 'logo',
    label: 'Primary logo',
    canonical_policy: 'vector_preferred',
    master_prefers: ['svg', 'pdf'],
  },
  'logo.secondary': { family: 'logo', label: 'Secondary logo', canonical_policy: 'vector_preferred', master_prefers: ['svg'] },
  'logo.mark': { family: 'logo', label: 'Mark / monogram', canonical_policy: 'vector_preferred', master_prefers: ['svg'] },
  'logo.wordmark': { family: 'logo', label: 'Wordmark', canonical_policy: 'vector_preferred', master_prefers: ['svg'] },
  'logo.black': { family: 'logo', label: 'Logo black', canonical_policy: 'vector_preferred', master_prefers: ['svg'] },
  'logo.white': { family: 'logo', label: 'Logo white', canonical_policy: 'vector_preferred', master_prefers: ['svg'] },

  // Icons / platform
  favicon: { family: 'favicon', label: 'Favicon', canonical_policy: 'svg_plus_png', master_prefers: ['svg', 'png'] },
  'icon.app': { family: 'app-icon', label: 'App icon', canonical_policy: 'artwork_1024', master_prefers: ['png', 'svg'] },
  'icon.ios': { family: 'app-icon', label: 'iOS icon set', canonical_policy: 'artwork_1024', master_prefers: ['png'] },
  'icon.macos': { family: 'app-icon', label: 'macOS icon', canonical_policy: 'artwork_1024', master_prefers: ['png', 'icns'] },
  'icon.android': { family: 'app-icon', label: 'Android icon', canonical_policy: 'artwork_1024', master_prefers: ['png', 'svg'] },
  'icon.maskable': { family: 'app-icon', label: 'Maskable / adaptive', canonical_policy: 'artwork_1024', master_prefers: ['png'] },
  'icon.windows': { family: 'app-icon', label: 'Windows icon', canonical_policy: 'artwork_1024', master_prefers: ['png', 'ico'] },

  // Heroes / imagery
  'hero.landscape': { family: 'hero', label: 'Desktop hero', canonical_policy: 'photographic', master_prefers: ['jpg', 'png', 'tiff'] },
  'hero.ultrawide': { family: 'hero', label: 'Ultrawide hero', canonical_policy: 'photographic', master_prefers: ['jpg', 'png'] },
  'hero.mobile': { family: 'hero', label: 'Mobile hero', canonical_policy: 'photographic', master_prefers: ['jpg', 'png'] },
  'hero.poster': { family: 'hero', label: 'Poster / still', canonical_policy: 'photographic', master_prefers: ['jpg', 'png'] },
  'hero.background': { family: 'hero', label: 'Background hero', canonical_policy: 'photographic', master_prefers: ['jpg', 'png'] },
  'hero.product': { family: 'hero', label: 'Product hero', canonical_policy: 'photographic', master_prefers: ['png', 'jpg'] },

  // Social
  'social.og': { family: 'social', label: 'Open Graph', canonical_policy: 'composition', master_prefers: ['png', 'jpg'] },
  'social.square': { family: 'social', label: 'Square social', canonical_policy: 'composition', master_prefers: ['png', 'jpg'] },
  'social.portrait': { family: 'social', label: 'Portrait social', canonical_policy: 'composition', master_prefers: ['png', 'jpg'] },
  'social.story': { family: 'social', label: 'Story / reel poster', canonical_policy: 'composition', master_prefers: ['png', 'jpg'] },

  // Product shots
  'product.raw': { family: 'product-shot', label: 'Raw screenshot', canonical_policy: 'png_transparency', master_prefers: ['png'] },
  'product.framed': { family: 'product-shot', label: 'Device-framed shot', canonical_policy: 'png_transparency', master_prefers: ['png'] },
  'product.marketing': { family: 'product-shot', label: 'Marketing composition', canonical_policy: 'composition', master_prefers: ['png', 'jpg'] },
  'product.thumb': { family: 'product-shot', label: 'Thumbnail', canonical_policy: 'png_transparency', master_prefers: ['png', 'webp'] },
  'product.docs': { family: 'product-shot', label: 'Documentation shot', canonical_policy: 'png_transparency', master_prefers: ['png'] },

  // Motion
  'motion.hero': { family: 'video', label: 'Hero video', canonical_policy: 'video_master', master_prefers: ['mov', 'mp4'] },
  'motion.loop': { family: 'video', label: 'UI loop (silent)', canonical_policy: 'video_loop', master_prefers: ['mp4', 'webm'] },
  'motion.lottie': { family: 'motion-graphics', label: 'Lottie', canonical_policy: 'source_preserve', master_prefers: ['json'] },
  'motion.rive': { family: 'motion-graphics', label: 'Rive', canonical_policy: 'source_preserve', master_prefers: ['riv'] },

  // 3D
  'model.product': { family: 'model', label: 'Product model', canonical_policy: 'glb', master_prefers: ['glb', 'gltf'] },
  'model.brand': { family: 'model', label: 'Brand render model', canonical_policy: 'glb', master_prefers: ['glb'] },
  'model.ar': { family: 'model', label: 'AR model', canonical_policy: 'glb_usdz', master_prefers: ['glb', 'usdz'] },
  'model.engineering': { family: 'model', label: 'Engineering model', canonical_policy: 'source_preserve', master_prefers: ['glb', 'fbx', 'obj'] },

  // Type + tokens + docs
  'type.display': { family: 'font', label: 'Display font', canonical_policy: 'licensed_source', master_prefers: ['otf', 'ttf'] },
  'type.heading': { family: 'font', label: 'Heading font', canonical_policy: 'licensed_source', master_prefers: ['otf', 'ttf', 'woff2'] },
  'type.body': { family: 'font', label: 'Body font', canonical_policy: 'licensed_source', master_prefers: ['otf', 'ttf', 'woff2'] },
  'type.mono': { family: 'font', label: 'Mono font', canonical_policy: 'licensed_source', master_prefers: ['otf', 'ttf', 'woff2'] },
  'type.ui': { family: 'font', label: 'UI font', canonical_policy: 'licensed_source', master_prefers: ['otf', 'ttf', 'woff2'] },
  'token.color': { family: 'tokens', label: 'Color tokens', canonical_policy: 'dtcg_json', master_prefers: ['json', 'yaml'] },
  'token.type': { family: 'tokens', label: 'Type tokens', canonical_policy: 'dtcg_json', master_prefers: ['json'] },
  'token.theme': { family: 'tokens', label: 'Theme / CSS', canonical_policy: 'token_source', master_prefers: ['css', 'json'] },
  'doc.guideline': { family: 'docs', label: 'Brand guideline', canonical_policy: 'structured', master_prefers: ['md', 'html', 'json'] },
  'doc.markdown': { family: 'docs', label: 'Markdown doc', canonical_policy: 'structured', master_prefers: ['md'] },

  'asset.generic': { family: 'generic', label: 'Unclassified asset', canonical_policy: 'inspect', master_prefers: [] },
});

export function listAssetRoles() {
  return Object.entries(ASSET_ROLES).map(([id, meta]) => ({ id, ...meta }));
}

export function getAssetRole(id) {
  return ASSET_ROLES[String(id || '').trim()] || null;
}

/** Composition / canvas targets for hero & social roles */
export const ROLE_CANVAS = Object.freeze({
  'hero.landscape': { width: 1920, height: 1080 },
  'hero.ultrawide': { width: 2560, height: 1080 },
  'hero.mobile': { width: 1080, height: 1350 },
  'hero.poster': { width: 1080, height: 1920 },
  'hero.product': { width: 1920, height: 1080 },
  'social.og': { width: 1200, height: 630 },
  'social.square': { width: 1080, height: 1080 },
  'social.portrait': { width: 1080, height: 1350 },
  'social.story': { width: 1080, height: 1920 },
  'icon.app': { width: 1024, height: 1024 },
  'icon.maskable': { width: 512, height: 512, safe_padding: 0.2 },
});

/**
 * Heuristic role classification from filename + extension + optional dims.
 */
export function classifyAssetRole({ path: filePath, contentType, width, height, textHint } = {}) {
  const name = String(filePath || '').toLowerCase();
  const base = name.split('/').pop() || '';
  const ext = (base.includes('.') ? base.split('.').pop() : '') || '';
  const hints = `${base} ${textHint || ''}`.toLowerCase();

  let role = 'asset.generic';
  let confidence = 0.35;

  if (/\.(otf|ttf|woff2?)$/i.test(name) || ['otf', 'ttf', 'woff', 'woff2'].includes(ext)) {
    role = hints.includes('mono') || hints.includes('code')
      ? 'type.mono'
      : hints.includes('display')
        ? 'type.display'
        : hints.includes('heading') || hints.includes('title')
          ? 'type.heading'
          : 'type.body';
    confidence = 0.95;
  } else if (/\.(glb|gltf|usdz|obj|fbx)$/i.test(name)) {
    role = hints.includes('ar') || ext === 'usdz' ? 'model.ar' : 'model.product';
    confidence = 0.88;
  } else if (/\.(mp4|mov|webm|mkv)$/i.test(name)) {
    role = hints.includes('loop') || hints.includes('ui') ? 'motion.loop' : 'motion.hero';
    confidence = 0.9;
  } else if (/\.json$/i.test(name) && (hints.includes('lottie') || hints.includes('animation'))) {
    role = 'motion.lottie';
    confidence = 0.85;
  } else if (/\.riv$/i.test(name)) {
    role = 'motion.rive';
    confidence = 0.9;
  } else if (/\.(css|scss)$/i.test(name) || (/\.json$/i.test(name) && hints.includes('token'))) {
    role = hints.includes('token') || hints.includes('theme') ? 'token.theme' : 'token.color';
    confidence = 0.8;
  } else if (/\.(md|markdown)$/i.test(name)) {
    role = hints.includes('brand') || hints.includes('guideline') ? 'doc.guideline' : 'doc.markdown';
    confidence = 0.75;
  } else if (/favicon|apple-touch|site\.webmanifest/i.test(hints)) {
    role = 'favicon';
    confidence = 0.96;
  } else if (/maskable|adaptive/i.test(hints)) {
    role = 'icon.maskable';
    confidence = 0.92;
  } else if (/app[-_]?icon|icon[-_]?1024|icns/i.test(hints)) {
    role = 'icon.app';
    confidence = 0.93;
  } else if (/logo|wordmark|mark[-_]/i.test(hints) || ext === 'svg') {
    if (/mark|mono|glyph/i.test(hints)) role = 'logo.mark';
    else if (/word/i.test(hints)) role = 'logo.wordmark';
    else if (/white/i.test(hints)) role = 'logo.white';
    else if (/black/i.test(hints)) role = 'logo.black';
    else role = 'logo.primary';
    confidence = ext === 'svg' ? 0.96 : 0.85;
  } else if (/og[-_]?image|open[-_]?graph|twitter[-_]?card|social/i.test(hints)) {
    role = 'social.og';
    confidence = 0.91;
  } else if (/hero|banner|masthead/i.test(hints)) {
    if (width && height && height > width) role = 'hero.mobile';
    else if (width && height && width / height > 2) role = 'hero.ultrawide';
    else role = 'hero.landscape';
    confidence = 0.88;
  } else if (/screenshot|product[-_]?shot|ui[-_]?shot/i.test(hints)) {
    role = 'product.raw';
    confidence = 0.86;
  } else if (ext === 'html' || ext === 'htm') {
    role = 'doc.guideline';
    confidence = 0.55;
  }

  const meta = getAssetRole(role) || ASSET_ROLES['asset.generic'];
  return {
    role,
    family: meta.family,
    confidence,
    label: meta.label,
    canonical_policy: meta.canonical_policy,
    needs_review: confidence < 0.7,
  };
}
