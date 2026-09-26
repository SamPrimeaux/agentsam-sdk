import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { BrandAssetError, assert } from './errors.js';
import { inspectBrandAsset } from './inspect.js';

const require = createRequire(import.meta.url);

function tryLoadSharp() {
  try {
    return require('sharp');
  } catch {
    return null;
  }
}

export function hasMagick() {
  const r = spawnSync('magick', ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}

export function hasSharp() {
  return Boolean(tryLoadSharp());
}

/**
 * Portable capability discovery — no OS package-manager commands.
 * Remediation belongs in agentsam setup / recipes.js.
 */
export function discoverDerivativeCapabilities() {
  const sharp = hasSharp();
  const magick = hasMagick();
  return {
    backends: {
      sharp: { available: sharp, capability_id: 'image.raster.transform' },
      imagemagick: { available: magick, capability_id: 'image.raster.transform' },
      potrace: { available: Boolean(spawnSync('potrace', ['-v'], { encoding: 'utf8' }).status === 0 || spawnSync('potrace', ['-v'], { encoding: 'utf8' }).status === 1), capability_id: 'image.vectorize' },
    },
    preferred_backend: sharp ? 'sharp' : magick ? 'imagemagick' : null,
    formats: {
      png: sharp || magick || true,
      jpeg: sharp || magick,
      webp: sharp || magick,
      avif: sharp || magick,
      icns: magick,
    },
  };
}

function blockedCapability({ id, format, capabilityId = 'image.raster.transform' }) {
  return {
    id,
    format,
    status: 'blocked',
    reason: 'capability_missing',
    capability_id: capabilityId,
    acceptable_backends: capabilityId === 'image.vectorize' ? ['potrace'] : ['sharp', 'imagemagick'],
  };
}

async function deriveWithSharp(sharp, sourcePath, dest, { format, width, height, quality }) {
  let pipeline = sharp(sourcePath, { failOn: 'none' }).rotate();
  if (width && height) {
    pipeline = pipeline.resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }
  if (format === 'png') pipeline = pipeline.png();
  else if (format === 'jpeg' || format === 'jpg') pipeline = pipeline.jpeg({ quality: quality ?? 90 });
  else if (format === 'webp') pipeline = pipeline.webp({ quality: quality ?? 90 });
  else if (format === 'avif') pipeline = pipeline.avif({ quality: quality ?? 80 });
  else throw new BrandAssetError('unsupported_format', `Sharp cannot write ${format}`);
  await pipeline.toFile(dest);
}

function deriveWithMagick(sourcePath, dest, { format, width, height, quality }) {
  const args = [path.resolve(sourcePath)];
  if (width && height) args.push('-resize', `${width}x${height}`);
  args.push('-background', 'none');
  if (format === 'png') args.push('-define', 'png:color-type=6');
  if ((format === 'webp' || format === 'avif' || format === 'jpeg') && quality != null) {
    args.push('-quality', String(quality));
  } else if (format === 'webp') args.push('-quality', '90');
  else if (format === 'avif') args.push('-quality', '80');
  args.push(dest);
  const r = spawnSync('magick', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new BrandAssetError('derive_failed', r.stderr || r.stdout || 'magick failed');
  }
}

/**
 * Expand derivative declarations into concrete files.
 * Prefer Sharp (declared dependency); ImageMagick is optional enrichment.
 */
export async function deriveBrandAssets({
  sourcePath,
  outDir,
  derivatives = [],
  asset = 'asset',
} = {}) {
  assert(sourcePath && fs.existsSync(sourcePath), 'source_missing', `Source missing: ${sourcePath}`);
  const caps = discoverDerivativeCapabilities();
  const sharp = tryLoadSharp();
  fs.mkdirSync(outDir, { recursive: true });

  const artifacts = [];
  for (const d of derivatives) {
    const format = String(d.format || 'png').toLowerCase();
    const width = Number(d.width || d.size || 0) || null;
    const height = Number(d.height || d.size || width || 0) || null;
    const id = d.id || `${format}-${width || 'x'}`;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const dest = path.join(outDir, d.filename || `${asset}-${width || 'x'}.${ext}`);

    if (format === 'icns' && !caps.backends.imagemagick.available) {
      artifacts.push({
        ...blockedCapability({ id, format }),
        role: d.role || 'native',
        status: 'blocked',
        capability_id: 'image.native.macos-icon',
        acceptable_backends: ['imagemagick', 'platform-adapter'],
      });
      continue;
    }

    try {
      if (sharp && format !== 'icns') {
        await deriveWithSharp(sharp, sourcePath, dest, {
          format,
          width,
          height,
          quality: d.quality,
        });
      } else if (caps.backends.imagemagick.available) {
        deriveWithMagick(sourcePath, dest, { format, width, height, quality: d.quality });
      } else if (format === 'png' && !width && !height) {
        fs.copyFileSync(sourcePath, dest);
      } else {
        artifacts.push({
          ...blockedCapability({ id, format }),
          role: d.role || 'raster',
        });
        continue;
      }

      const inspected = inspectBrandAsset(dest, { role: d.role || 'raster' });
      artifacts.push({
        id,
        role: d.role || 'raster',
        format,
        status: 'generated',
        backend: sharp && format !== 'icns' ? 'sharp' : 'imagemagick',
        path: dest,
        width: inspected.width,
        height: inspected.height,
        bytes: inspected.bytes,
        content_type: inspected.content_type,
        sha256: inspected.sha256,
        quality: d.quality ?? null,
      });
    } catch (err) {
      artifacts.push({
        id,
        role: d.role || 'raster',
        format,
        status: 'failed',
        reason: err?.code || 'derive_failed',
        message: err?.message || String(err),
      });
    }
  }

  return { capabilities: caps, artifacts };
}

export function formatBytesKb(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB`;
}
