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
  png: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true },
  jpg: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true },
  jpeg: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true },
  webp: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true },
  avif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true },
  gif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true, animated: true },
  apng: { family: 'raster', resize_ladder: false, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: false, animated: true },
  tiff: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true },
  tif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: true, ingest: true, edit: true, inspect: true, convert: true, optimize: true, preview: true, export: true },
  heic: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: false },
  heif: { family: 'raster', resize_ladder: true, poster_frame: false, recolorable: false, transparency: false, ingest: true, edit: false },

  // Vector / print ingest (preserve; limited edit)
  svg: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: true, ingest: true, edit: true, inspect: true, convert: true, preview: true, export: true },
  pdf: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  eps: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  ai: { family: 'vector', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },

  // Platform icons
  ico: { family: 'platform', resize_ladder: false, poster_frame: false, recolorable: false, platform: true, ingest: true, edit: false, inspect: true, export: true, preserve: true },
  icns: { family: 'platform', resize_ladder: false, poster_frame: false, recolorable: false, platform: true, ingest: true, edit: false, inspect: true, export: true, preserve: true },

  // Video
  mp4: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  mov: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  webm: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  mkv: { family: 'video', resize_ladder: false, poster_frame: true, recolorable: false, ingest: true, edit: false, export: true, preserve: true },

  // Motion graphics
  lottie: { family: 'motion-graphics', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true, ext_alias: 'json' },
  riv: { family: 'motion-graphics', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },

  // 3D
  glb: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  gltf: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  usdz: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  obj: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  fbx: { family: 'model', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },

  // Textures
  ktx2: { family: 'texture', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },

  // Fonts — licensing gate required before redistribute
  otf: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true, licensing_required: true },
  ttf: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true, licensing_required: true },
  woff: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true, licensing_required: true },
  woff2: { family: 'font', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true, licensing_required: true },

  // Tokens / theme / docs / code
  json: { family: 'tokens', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true },
  yaml: { family: 'tokens', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true },
  yml: { family: 'tokens', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true },
  css: { family: 'theme', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true },
  scss: { family: 'theme', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true },
  md: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true },
  markdown: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true },
  html: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true, extractable: true },
  htm: { family: 'docs', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true, inspect: true, export: true, preserve: true, extractable: true },
  // Office / interchange documents are inventoried and preserved. Deep text,
  // table, slide, and embedded-media extraction belongs to document readers.
  docx: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  pptx: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  xlsx: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  odt: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  odp: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  ods: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  rtf: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: false, export: true, preserve: true },
  txt: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  csv: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },
  xml: { family: 'document', resize_ladder: false, poster_frame: false, recolorable: false, ingest: true, edit: true },

  // Archives (ingest containers — not assets themselves)
  zip: { family: 'archive', resize_ladder: false, ingest: true, edit: false, inspect: true, export: true, preserve: true, container: true },
  tar: { family: 'archive', resize_ladder: false, ingest: true, edit: false, inspect: true, export: true, preserve: true, container: true },
  gz: { family: 'archive', resize_ladder: false, ingest: true, edit: false, inspect: true, export: true, preserve: true, container: true },
  tgz: { family: 'archive', resize_ladder: false, ingest: true, edit: false, inspect: true, export: true, preserve: true, container: true },
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
  document: {
    ingest: ['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'rtf', 'txt', 'csv', 'xml'],
    canonical: [],
    web_delivery: [],
    export: [],
    preserve_original: true,
  },
  archive: {
    ingest: ['zip', 'tar', 'gz', 'tgz'],
    canonical: [],
    web_delivery: [],
    export: [],
    container: true,
  },
});

const OPERATION_KEYS = Object.freeze([
  'read',
  'inspect',
  'edit',
  'generate',
  'convert',
  'optimize',
  'preview',
  'export',
  'preserve_original',
  'validate_roundtrip',
]);

/**
 * Return explicit operation support without confusing ingest with editability.
 * `read` means the source can be imported/preserved; `inspect` means the
 * BrandPack processor has a real metadata/content inspection path. Other
 * operations are true only when the format row declares them explicitly.
 */
export function formatCapabilities(format) {
  const key = String(format || '').toLowerCase().replace(/^\./, '');
  const row = FORMAT_CAPABILITIES[key];
  if (!row) {
    return {
      resize_ladder: false,
      poster_frame: false,
      recolorable: false,
      unknown: true,
      operations: Object.fromEntries(OPERATION_KEYS.map((operation) => [operation, false])),
      inspection_level: 'unsupported',
    };
  }
  const operations = {
    read: row.ingest === true,
    inspect: row.inspect === true,
    edit: row.edit === true,
    generate: row.generate === true,
    convert: row.convert === true,
    optimize: row.optimize === true,
    preview: row.preview === true,
    export: row.export === true,
    preserve_original: row.preserve === true || row.preserve_original === true || row.ingest === true,
    validate_roundtrip: row.validate_roundtrip === true,
  };
  return {
    ...row,
    operations,
    inspection_level: operations.inspect ? 'metadata_and_declared_content' : operations.read ? 'inventory_only' : 'unsupported',
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
