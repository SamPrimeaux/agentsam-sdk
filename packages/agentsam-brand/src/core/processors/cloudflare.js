/**
 * Cloudflare Images — edge DERIVABLE transforms.
 * Does not locally encode; returns a delivery plan / transform descriptor.
 */

import { inspectBrandAsset } from '../inspect.js';

export const cloudflareProcessor = {
  id: 'cloudflare',
  label: 'Cloudflare Images',

  available() {
    // Edge path is always "available" as a planner target when CF is configured.
    // Actual upload uses CloudflareImagesDeliveryAdapter.
    return true;
  },

  async inspect(input) {
    const meta = typeof input === 'string' && input.includes('/')
      ? inspectBrandAsset(input)
      : { path: input, processor: 'cloudflare' };
    meta.processor = 'cloudflare';
    meta.derivative_kind = 'edge';
    return meta;
  },

  /**
   * Plan an edge resize — no local bytes written.
   */
  async resize(input, options = {}) {
    return {
      path: null,
      format: options.format || 'auto',
      bytes: null,
      width: options.width || null,
      height: options.height || null,
      processor: 'cloudflare',
      derivative_kind: 'edge',
      materialized: false,
      options: {
        width: options.width,
        height: options.height,
        fit: options.fit || 'scale-down',
      },
      note: 'Cloudflare Images generates this on request — retain high-quality master',
    };
  },

  async encode(input, options = {}) {
    return {
      path: null,
      format: options.format || 'auto',
      bytes: null,
      processor: 'cloudflare',
      derivative_kind: 'edge',
      materialized: false,
      options: {
        format: options.format || 'auto', // CF auto AVIF/WebP negotiation
        quality: options.quality,
      },
      note: 'Prefer role_canonical master upload; let CF negotiate encoding',
    };
  },

  async optimize(input, options = {}) {
    return this.encode(input, options);
  },
};
