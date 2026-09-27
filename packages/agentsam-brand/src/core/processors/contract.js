/**
 * ImageProcessor adapter contract.
 *
 * PUBLIC API stays: agentsam brand optimize / derive
 * Encoders are pluggable backends — never the product surface.
 *
 * REJECTED as hard dependency:
 *   @squoosh/cli (npm 0.7.3) — abandoned, Node 12–16 only, crashes on Node 22+
 *
 * ALLOWED backends (benchmark / prefer per job):
 *   sharp | squoosh (maintained binary) | native (ImageMagick) | cloudflare | wasm | go
 */

/** @typedef {'sharp'|'squoosh'|'native'|'cloudflare'|'wasm'|'go'|'ffmpeg'|'custom'} ProcessorId */

/**
 * @typedef {object} ImageMetadata
 * @property {string} path
 * @property {string} content_type
 * @property {number} bytes
 * @property {number|null} [width]
 * @property {number|null} [height]
 * @property {boolean|null} [alpha]
 * @property {string} [sha256]
 * @property {string} [processor]
 */

/**
 * @typedef {object} EncodeOptions
 * @property {'png'|'jpeg'|'jpg'|'webp'|'avif'|'jxl'|'wp2'|'oxipng'} format
 * @property {number} [quality]   // 0–100 where applicable
 * @property {number} [cqLevel]   // AVIF
 * @property {boolean} [lossless]
 * @property {number} [level]     // oxipng 1–6
 * @property {'auto'|object} [auto]
 */

/**
 * @typedef {object} ResizeOptions
 * @property {number} [width]
 * @property {number} [height]
 * @property {'contain'|'cover'|'stretch'} [fit]
 * @property {string} [method] // lanczos3 | mitchell | catrom | triangle
 */

/**
 * @typedef {object} ProcessorAsset
 * @property {string} path
 * @property {string} format
 * @property {number} bytes
 * @property {number|null} [width]
 * @property {number|null} [height]
 * @property {string} processor
 * @property {string} [processor_version]
 * @property {object} [options]
 * @property {string} [sha256]
 * @property {string} [content_type]
 */

/**
 * @typedef {object} ImageProcessor
 * @property {ProcessorId} id
 * @property {string} label
 * @property {() => Promise<boolean>|boolean} available
 * @property {(input: string) => Promise<ImageMetadata>} [inspect]
 * @property {(input: string, options: ResizeOptions & { outPath: string }) => Promise<ProcessorAsset>} [resize]
 * @property {(input: string, options: EncodeOptions & { outPath: string }) => Promise<ProcessorAsset>} [encode]
 * @property {(input: string, options: object & { outPath: string }) => Promise<ProcessorAsset>} [optimize]
 */

/** Official abandoned npm package — never require / spawn via npx. */
export const REJECTED_PROCESSORS = Object.freeze({
  'squoosh-npm': {
    id: 'squoosh-npm',
    package: '@squoosh/cli',
    reason: 'abandoned (0.7.3); Node 12–16 only; crashes on Node 22+ (navigator setter)',
    status: 'rejected',
  },
  'squoosh-lib': {
    id: 'squoosh-lib',
    package: '@squoosh/lib',
    reason: 'abandoned companion to @squoosh/cli',
    status: 'rejected',
  },
});

export const PROCESSOR_CAPABILITIES = Object.freeze({
  sharp: {
    id: 'sharp',
    label: 'Sharp',
    kind: 'node',
    formats: ['png', 'jpeg', 'webp', 'avif', 'tiff', 'gif'],
    resize: true,
    alpha: true,
    optimize: true,
    speed: 'fast',
  },
  squoosh: {
    id: 'squoosh',
    label: 'Squoosh (maintained binary)',
    kind: 'binary',
    formats: ['png', 'jpeg', 'webp', 'avif', 'jxl', 'wp2', 'oxipng', 'mozjpeg'],
    resize: true,
    alpha: true,
    optimize: true,
    butteraugli: true,
    speed: 'medium',
    note: 'Homebrew/Scoop fork — NOT @squoosh/cli npm',
  },
  native: {
    id: 'native',
    label: 'ImageMagick',
    kind: 'binary',
    formats: ['png', 'jpeg', 'webp', 'avif', 'icns', 'tiff'],
    resize: true,
    alpha: true,
    optimize: false,
    speed: 'medium',
  },
  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare Images',
    kind: 'edge',
    formats: ['avif', 'webp', 'jpeg', 'png'],
    resize: true,
    alpha: true,
    optimize: true,
    speed: 'edge',
    note: 'DERIVABLE at edge — materialize masters; CF negotiates delivery',
  },
  wasm: {
    id: 'wasm',
    label: 'WASM codecs',
    kind: 'wasm',
    formats: ['webp', 'avif', 'png'],
    resize: true,
    alpha: true,
    optimize: true,
    speed: 'preview',
    note: 'Studio instant preview / crop — not production bake unless bound',
  },
  go: {
    id: 'go',
    label: 'Go media worker',
    kind: 'worker',
    formats: ['*'],
    resize: true,
    alpha: true,
    optimize: true,
    speed: 'heavy',
    note: 'Queued durable jobs — 4K / batch / benchmark suites',
  },
});

/**
 * Job planner hint — preferred then fallback.
 * @param {object} requirements
 */
export function planProcessorOrder(requirements = {}) {
  const preferred = [];
  const fallback = [];

  if (requirements.edge_only || requirements.delivery === 'cloudflare-images') {
    preferred.push('cloudflare');
    fallback.push('sharp', 'squoosh', 'native');
    return { preferred, fallback };
  }

  if (requirements.preview || requirements.surface === 'studio') {
    preferred.push('wasm', 'sharp');
    fallback.push('squoosh');
    return { preferred, fallback };
  }

  if (requirements.heavy || requirements.benchmark) {
    preferred.push('go', 'squoosh');
    fallback.push('sharp', 'native');
    return { preferred, fallback };
  }

  if (requirements.preserve_alpha && requirements.format === 'png') {
    preferred.push('sharp', 'squoosh');
    fallback.push('native');
    return { preferred, fallback };
  }

  if (requirements.format === 'icns') {
    preferred.push('native');
    fallback.push();
    return { preferred, fallback };
  }

  if (requirements.format === 'jxl' || requirements.format === 'wp2' || requirements.butteraugli) {
    preferred.push('squoosh');
    fallback.push('sharp', 'go');
    return { preferred, fallback };
  }

  // Default local path: dependable Node first, codec binary second
  preferred.push('sharp', 'squoosh');
  fallback.push('native', 'cloudflare');
  return { preferred, fallback };
}
