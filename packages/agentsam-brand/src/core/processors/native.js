import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectBrandAsset } from '../inspect.js';
import { BrandAssetError } from '../errors.js';

export function hasMagick() {
  const r = spawnSync('magick', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

export const nativeProcessor = {
  id: 'native',
  label: 'ImageMagick',

  available() {
    return hasMagick();
  },

  async inspect(input) {
    const meta = inspectBrandAsset(input);
    meta.processor = 'native';
    return meta;
  },

  async resize(input, { width, height, outPath }) {
    if (!hasMagick()) throw new BrandAssetError('processor_unavailable', 'magick not found');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const args = [path.resolve(input)];
    if (width || height) args.push('-resize', `${width || ''}x${height || ''}`);
    args.push('-background', 'none', outPath);
    const r = spawnSync('magick', args, { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new BrandAssetError('derive_failed', r.stderr || r.stdout || 'magick resize failed');
    }
    const inspected = inspectBrandAsset(outPath);
    return {
      path: outPath,
      format: path.extname(outPath).slice(1).toLowerCase(),
      bytes: inspected.bytes,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      content_type: inspected.content_type,
      processor: 'native',
      options: { width, height },
    };
  },

  async encode(input, { format, quality, outPath }) {
    if (!hasMagick()) throw new BrandAssetError('processor_unavailable', 'magick not found');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const fmt = String(format || 'png').toLowerCase();
    const args = [path.resolve(input), '-background', 'none'];
    if (fmt === 'png') args.push('-define', 'png:color-type=6');
    if ((fmt === 'webp' || fmt === 'avif' || fmt === 'jpeg' || fmt === 'jpg') && quality != null) {
      args.push('-quality', String(quality));
    } else if (fmt === 'webp') args.push('-quality', '90');
    else if (fmt === 'avif') args.push('-quality', '80');
    args.push(outPath);
    const r = spawnSync('magick', args, { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new BrandAssetError('derive_failed', r.stderr || r.stdout || 'magick encode failed');
    }
    const inspected = inspectBrandAsset(outPath);
    return {
      path: outPath,
      format: fmt === 'jpg' ? 'jpeg' : fmt,
      bytes: inspected.bytes,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      content_type: inspected.content_type,
      processor: 'native',
      options: { format: fmt, quality },
    };
  },

  async optimize(input, options = {}) {
    return this.encode(input, { format: options.format || 'webp', ...options });
  },
};
