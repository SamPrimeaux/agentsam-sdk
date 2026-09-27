/**
 * Format capability map (BrandPack v2) — by format + by family.
 * Open-set: new formats = code edit, not migration.
 *
 * DERIVABLE = system knows how to make it
 * MATERIALIZED = file is included in this pack export
 */

/** Per-extension capabilities */
export const FORMAT_CAPABILITIES = Object.freeze({
  // Raster
  png: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true },
  jpg: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: true },
  jpeg: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: true },
  webp: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true },
  avif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true },
  gif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true, animated: true },
  apng: { family: 'raster', resize_ladder: false, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: false, animated: true },
  tiff: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true },
  tif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true },
  heic: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: false },
  heif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: false },

  // Vector / print ingest (preserve; limited edit)
  svg: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: true, ingest: true, edit: true },
  pdf: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, preserve: true },
  eps: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, preserve: true },
  ai: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, preserve: true },

  // Platform icons
  ico: { family: 'platform', resize_ladder: false, poster_frame: false, recolorable: false, platform: true, ingest: true, edit: false },
  icns: { family: 'platform', resize_ladder: false, poster_frame: false, recolorable: false, platform: true, ingest: true, edit: false },

  // Video
  mp4: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false },
  mov: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false },
  webm: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false },
  mkv: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false, preserve: true },

  // Motion graphics
  lottie: { family: 'motion-graphics', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, ext_alias: 'json' },
  riv: { family: 'motion-graphics', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false },

  // 3D
  glb: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false },
  gltf: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false },
  usdz: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false },
  obj: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, preserve: true },
  fbx: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, preserve: true },

  // Textures
  ktx2: { family: 'texture', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false },

  // Fonts — licensing gate required before redistribute
  otf: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, licensing_required: true },
  ttf: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, licensing_required: true },
  woff: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, licensing_required: true },
  woff2: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, licensing_required: true },

  // Tokens / theme / docs / code
  json: { family: 'tokens', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  yaml: { family: 'tokens', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  yml: { family: 'tokens', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  css: { family: 'theme', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  scss: { family: 'theme', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  md: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  markdown: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  html: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, extractable: true },
  htm: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, extractable: true },

  // Archives (ingest containers — not assets themselves)
  zip: { family: 'archive', resize_ladder: false, ingest: true, edit: false, container: true },
  tar: { family: 'archive', resize_ladder: false, ingest: true, edit: false, container: true },
  gz: { family: 'archive', resize_ladder: false, ingest: true, edit: false, container: true },
  tgz: { family: 'archive', resize_ladder: false, ingest: true, edit: false, container: true },
});

/**
 * Family-level ingest / master / delivery / export defaults.
 * Matches the BrandPack v2 format-universe table.
 */
export const FORMAT_FAMILIES = Object.freeze({
  logo: {
    ingest: ['svg', 'pdf', 'eps', 'ai', 'png'],
    canonical: ['svg'],
    web_delivery: ['svg'],
    export: ['svg', 'pdf', 'png'],
  },
  raster: {
    ingest: ['png', 'jpg', 'jpeg', 'tiff', 'tif', 'heic', 'webp', 'avif'],
    canonical: ['png', 'tiff'],
    web_delivery: ['avif', 'webp', 'jpeg', 'png'],
    export: ['png', 'jpg'],
  },
  photography: {
    ingest: ['jpg', 'jpeg', 'png', 'tiff', 'heic'],
    canonical: ['jpeg'],
    web_delivery: ['avif', 'webp', 'jpeg'],
    export: ['jpg', 'png'],
  },
  transparency: {
    ingest: ['png', 'webp', 'avif'],
    canonical: ['png'],
    web_delivery: ['avif', 'webp', 'png'],
    export: ['png'],
  },
  favicon: {
    ingest: ['svg', 'png', 'ico'],
    canonical: ['svg', 'png'],
    web_delivery: ['svg', 'png', 'ico'],
    export: ['ico', 'png', 'svg'],
  },
  'app-icon': {
    ingest: ['png', 'svg', 'icns'],
    canonical: ['png'],
    web_delivery: [],
    export: ['icns', 'png', 'ico'],
  },
  social: {
    ingest: ['png', 'jpg', 'svg'],
    canonical: ['png'],
    web_delivery: ['avif', 'webp', 'jpeg'],
    export: ['png', 'jpg'],
  },
  video: {
    ingest: ['mov', 'mp4', 'webm', 'mkv'],
    canonical: ['mov', 'mp4'],
    web_delivery: ['mp4', 'hls'],
    export: ['mp4', 'webm', 'mov'],
    delivery_target: 'cloudflare-stream',
  },
  'motion-graphics': {
    ingest: ['json', 'riv'],
    canonical: ['json', 'riv'],
    web_delivery: ['json', 'riv'],
    export: ['json', 'riv', 'mp4'],
  },
  model: {
    ingest: ['glb', 'gltf', 'obj', 'fbx', 'usdz'],
    canonical: ['glb', 'gltf'],
    web_delivery: ['glb'],
    export: ['glb', 'gltf', 'usdz'],
  },
  font: {
    ingest: ['otf', 'ttf', 'woff', 'woff2'],
    canonical: ['otf', 'ttf'],
    web_delivery: ['woff2'],
    export: ['woff2', 'woff'], // only when licensing.redistributable === true
    licensing_required: true,
  },
  tokens: {
    ingest: ['json', 'yaml', 'yml'],
    canonical: ['json'],
    web_delivery: ['css', 'json'],
    export: ['json', 'yaml', 'css', 'ts'],
  },
  theme: {
    ingest: ['css', 'scss', 'json'],
    canonical: ['json'],
    web_delivery: ['css'],
    export: ['css', 'ts'],
  },
  docs: {
    ingest: ['md', 'html', 'json'],
    canonical: ['json', 'md'],
    web_delivery: ['html'],
    export: ['pdf', 'html', 'md'],
  },
  archive: {
    ingest: ['zip', 'tar', 'gz', 'tgz'],
    canonical: [],
    web_delivery: [],
    export: [],
    container: true,
  },
});

export function formatCapabilities(format) {
  const key = String(format || '').toLowerCase().replace(/^\./, '');
  return FORMAT_CAPABILITIES[key] || {
    resize_ladder: false,
    poster_frame: false,
    recolorable: false,
    unknown: true,
  };
}

export function canResizeFormat(format) {
  return Boolean(formatCapabilities(format).resize_ladder);
}

export function familyCapabilities(family) {
  return FORMAT_FAMILIES[String(family || '').toLowerCase()] || null;
}

/** Extensions accepted for drop-folder / archive walk */
export const INGEST_EXTENSIONS = Object.freeze(
  Object.entries(FORMAT_CAPABILITIES)
    .filter(([, c]) => c.ingest)
    .map(([ext]) => `.${ext}`),
);
