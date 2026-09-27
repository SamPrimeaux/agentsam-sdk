import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { inspectBrandAsset } from '../inspect.js';
import { BrandAssetError } from '../errors.js';

const require = createRequire(import.meta.url);

function tryLoadSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

export const sharpProcessor = {
  id: 'sharp',
  label: 'Sharp',

  available() {
    return Boolean(tryLoadSharp());
  },

  async inspect(input) {
    const meta = inspectBrandAsset(input);
    const sharp = tryLoadSharp();
    if (sharp) {
      try {
        const info = await sharp(input, { failOn: 'none' }).metadata();
        meta.width = info.width ?? meta.width;
        meta.height = info.height ?? meta.height;
        meta.alpha = info.hasAlpha ?? meta.alpha;
      } catch {
        /* keep sniff */
      }
    }
    meta.processor = 'sharp';
    return meta;
  },

  async resize(input, { width, height, fit = 'contain', outPath }) {
    const sharp = tryLoadSharp();
    if (!sharp) throw new BrandAssetError('processor_unavailable', 'sharp not installed');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    let pipeline = sharp(input, { failOn: 'none' }).rotate();
    if (width || height) {
      pipeline = pipeline.resize(width || null, height || null, {
        fit,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      });
    }
    await pipeline.toFile(outPath);
    const inspected = inspectBrandAsset(outPath);
    return {
      path: outPath,
      format: path.extname(outPath).slice(1).toLowerCase(),
      bytes: inspected.bytes,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      content_type: inspected.content_type,
      processor: 'sharp',
      options: { width, height, fit },
    };
  },

  async encode(input, {
    format,
    quality,
    lossless,
    cqLevel,
    outPath,
  }) {
    const sharp = tryLoadSharp();
    if (!sharp) throw new BrandAssetError('processor_unavailable', 'sharp not installed');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const fmt = String(format || 'webp').toLowerCase();
    let pipeline = sharp(input, { failOn: 'none' }).rotate();
    if (fmt === 'png') pipeline = pipeline.png(lossless ? {} : { compressionLevel: 9 });
    else if (fmt === 'jpeg' || fmt === 'jpg') pipeline = pipeline.jpeg({ quality: quality ?? 90 });
    else if (fmt === 'webp') {
      pipeline = pipeline.webp({
        quality: quality ?? 80,
        lossless: Boolean(lossless),
      });
    } else if (fmt === 'avif') {
      pipeline = pipeline.avif({
        quality: quality ?? (cqLevel != null ? Math.max(1, 100 - cqLevel * 1.5) : 80),
      });
    } else {
      throw new BrandAssetError('unsupported_format', `sharp cannot encode ${fmt}`);
    }
    await pipeline.toFile(outPath);
    const inspected = inspectBrandAsset(outPath);
    return {
      path: outPath,
      format: fmt === 'jpg' ? 'jpeg' : fmt,
      bytes: inspected.bytes,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      content_type: inspected.content_type,
      processor: 'sharp',
      options: { format: fmt, quality, lossless, cqLevel },
    };
  },

  async optimize(input, options = {}) {
    const format = options.format || 'webp';
    return this.encode(input, { ...options, format });
  },
};
