import fs from 'node:fs';
import path from 'node:path';
import { canResizeFormat } from './capabilities.js';
import { BrandAssetError, assert } from './errors.js';
import { inspectBrandAsset } from './inspect.js';
import {
  discoverProcessors,
  resolveProcessor,
  hasMagick,
} from './processors/index.js';

export { hasMagick };
export { hasSquooshBinary } from './processors/index.js';

export function hasSharp() {
  return discoverProcessors().available.includes('sharp');
}

/**
 * Portable capability discovery — processors are adapters, not the product.
 */
export function discoverDerivativeCapabilities() {
  const discovery = discoverProcessors();
  return {
    backends: Object.fromEntries(
      discovery.processors.map((p) => [
        p.id,
        {
          available: p.available,
          capability_id: p.id === 'cloudflare'
            ? 'image.edge.transform'
            : p.id === 'squoosh'
              ? 'image.codec.squoosh-binary'
              : 'image.raster.transform',
        },
      ]),
    ),
    preferred_backend: discovery.preferred,
    rejected: discovery.rejected,
    formats: {
      png: discovery.available.some((id) => ['sharp', 'squoosh', 'native'].includes(id)),
      jpeg: discovery.available.some((id) => ['sharp', 'squoosh', 'native'].includes(id)),
      webp: discovery.available.some((id) => ['sharp', 'squoosh', 'native'].includes(id)),
      avif: discovery.available.some((id) => ['sharp', 'squoosh', 'native'].includes(id)),
      jxl: discovery.available.includes('squoosh'),
      wp2: discovery.available.includes('squoosh'),
      icns: discovery.available.includes('native'),
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
    acceptable_backends: capabilityId === 'image.vectorize'
      ? ['potrace']
      : ['sharp', 'squoosh', 'native'],
  };
}

/**
 * Expand derivative declarations into concrete files via processor scheduler.
 */
export async function deriveBrandAssets({
  sourcePath,
  outDir,
  derivatives = [],
  asset = 'asset',
  processor: forceProcessor,
} = {}) {
  assert(sourcePath && fs.existsSync(sourcePath), 'source_missing', `Source missing: ${sourcePath}`);
  const caps = discoverDerivativeCapabilities();
  fs.mkdirSync(outDir, { recursive: true });

  const artifacts = [];
  for (const d of derivatives) {
    const format = String(d.format || 'png').toLowerCase();
    const width = Number(d.width || d.size || 0) || null;
    const height = Number(d.height || d.size || width || 0) || null;
    const id = d.id || `${format}-${width || 'x'}`;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const dest = path.join(outDir, d.filename || `${asset}-${width || 'x'}.${ext}`);

    if (format === 'icns' && !caps.backends.native?.available) {
      artifacts.push({
        ...blockedCapability({ id, format }),
        role: d.role || 'native',
        status: 'blocked',
        capability_id: 'image.native.macos-icon',
        acceptable_backends: ['native', 'platform-adapter'],
      });
      continue;
    }

    if ((width || height) && !canResizeFormat(format)) {
      artifacts.push({
        id,
        format,
        role: d.role || 'raster',
        status: 'skipped',
        reason: 'format_no_resize_ladder',
        note: `${format} does not support resize ladders (see FORMAT_CAPABILITIES)`,
      });
      continue;
    }

    try {
      let encodeInput = sourcePath;
      let tmpResize = null;

      if ((width || height) && format !== 'icns') {
        const proc = await resolveProcessor(
          { format, preserve_alpha: true },
          { force: forceProcessor },
        );
        tmpResize = path.join(outDir, `.resize-${id}.png`);
        if (typeof proc.resize === 'function') {
          await proc.resize(sourcePath, { width, height, outPath: tmpResize });
          encodeInput = tmpResize;
        }
      }

      const proc = await resolveProcessor(
        { format: format === 'icns' ? 'icns' : format },
        { force: format === 'icns' ? 'native' : forceProcessor },
      );

      if (format === 'icns') {
        await proc.encode(encodeInput, { format: 'png', outPath: dest.replace(/\.icns$/i, '.png') });
        // ICNS still needs magick-specific path — mark generated png ladder for now
        const inspected = inspectBrandAsset(dest.replace(/\.icns$/i, '.png'));
        artifacts.push({
          id,
          role: d.role || 'native',
          format: 'png',
          status: 'generated',
          backend: proc.id,
          path: inspected.path,
          width: inspected.width,
          height: inspected.height,
          bytes: inspected.bytes,
          content_type: inspected.content_type,
          sha256: inspected.sha256,
          note: 'icns container requires platform adapter; png ladder emitted',
        });
      } else {
        const result = await proc.encode(encodeInput, {
          format,
          quality: d.quality,
          outPath: dest,
        });
        artifacts.push({
          id,
          role: d.role || 'raster',
          format,
          status: 'generated',
          backend: result.processor,
          path: result.path,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          content_type: result.content_type,
          sha256: result.sha256,
          quality: d.quality ?? null,
          receipt: {
            processor: result.processor,
            version: result.processor_version || null,
            options: result.options,
          },
        });
      }

      if (tmpResize) {
        try {
          fs.unlinkSync(tmpResize);
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      if (err?.code === 'processor_unavailable' || err?.code === 'processor_rejected') {
        artifacts.push({
          ...blockedCapability({ id, format }),
          role: d.role || 'raster',
          message: err.message,
        });
        continue;
      }
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
