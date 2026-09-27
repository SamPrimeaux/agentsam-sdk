/**
 * Processor registry + scheduler.
 * Public surface never names Squoosh/Sharp — only agentsam brand optimize.
 */

import {
  PROCESSOR_CAPABILITIES,
  REJECTED_PROCESSORS,
  planProcessorOrder,
} from './contract.js';
import { sharpProcessor } from './sharp.js';
import { squooshProcessor, hasSquooshBinary } from './squoosh-binary.js';
import { nativeProcessor, hasMagick } from './native.js';
import { cloudflareProcessor } from './cloudflare.js';
import { BrandAssetError } from '../errors.js';

const PROCESSORS = Object.freeze({
  sharp: sharpProcessor,
  squoosh: squooshProcessor,
  native: nativeProcessor,
  cloudflare: cloudflareProcessor,
});

export {
  PROCESSOR_CAPABILITIES,
  REJECTED_PROCESSORS,
  planProcessorOrder,
  hasSquooshBinary,
  hasMagick,
};

export function listProcessors() {
  return Object.values(PROCESSORS).map((p) => {
    const caps = PROCESSOR_CAPABILITIES[p.id] || {};
    let available = false;
    try {
      available = Boolean(p.available());
    } catch {
      available = false;
    }
    return {
      id: p.id,
      label: p.label,
      available,
      ...caps,
    };
  });
}

export function discoverProcessors() {
  const listed = listProcessors();
  const available = listed.filter((p) => p.available).map((p) => p.id);
  return {
    processors: listed,
    available,
    preferred: available.includes('sharp')
      ? 'sharp'
      : available.includes('squoosh')
        ? 'squoosh'
        : available.includes('native')
          ? 'native'
          : null,
    rejected: Object.values(REJECTED_PROCESSORS),
    note: '@squoosh/cli npm is rejected; use maintained squoosh binary or sharp',
  };
}

export function getProcessor(id) {
  if (id === 'squoosh-npm' || id === '@squoosh/cli') {
    throw new BrandAssetError(
      'processor_rejected',
      '@squoosh/cli is abandoned and incompatible with Node 22+. Use sharp or the maintained squoosh binary.',
      REJECTED_PROCESSORS['squoosh-npm'],
    );
  }
  return PROCESSORS[id] || null;
}

/**
 * Pick first available processor from preferred → fallback.
 */
export async function resolveProcessor(requirements = {}, { force } = {}) {
  if (force) {
    const p = getProcessor(force);
    if (!p) throw new BrandAssetError('unknown_processor', `Unknown processor: ${force}`);
    if (force !== 'cloudflare' && !(await Promise.resolve(p.available()))) {
      throw new BrandAssetError('processor_unavailable', `${force} is not available`);
    }
    return p;
  }

  const order = planProcessorOrder(requirements);
  const chain = [...order.preferred, ...order.fallback];
  for (const id of chain) {
    const p = PROCESSORS[id];
    if (!p) continue;
    if (id === 'cloudflare') {
      if (requirements.edge_ok || requirements.delivery === 'cloudflare-images' || requirements.prefer_edge) {
        return p;
      }
      continue;
    }
    if (await Promise.resolve(p.available())) return p;
  }
  throw new BrandAssetError(
    'processor_unavailable',
    'No image processor available (install sharp, squoosh binary, or ImageMagick)',
    discoverProcessors(),
  );
}

/**
 * Run encode through the scheduler.
 */
export async function encodeWithScheduler(input, options = {}) {
  const processor = await resolveProcessor(
    {
      format: options.format,
      preserve_alpha: options.preserve_alpha,
      butteraugli: options.auto === 'auto' || options.butteraugli,
      delivery: options.delivery,
      edge_ok: options.edge_ok,
    },
    { force: options.processor },
  );
  return processor.encode(input, options);
}

/**
 * Run optimize (role-aware caller supplies policy).
 */
export async function optimizeWithScheduler(input, options = {}) {
  const processor = await resolveProcessor(
    {
      format: options.format,
      preserve_alpha: options.preserve_alpha,
      butteraugli: true,
      preview: options.preview,
      heavy: options.heavy,
      delivery: options.delivery,
    },
    { force: options.processor },
  );
  if (typeof processor.optimize === 'function') {
    return processor.optimize(input, options);
  }
  return processor.encode(input, options);
}
