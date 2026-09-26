import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrandAssetError, assert } from './errors.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function sha256Buffer(buf) {
  return `sha256:${crypto.createHash('sha256').update(buf).digest('hex')}`;
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function isExcludedIntermediate(filePath) {
  const base = path.basename(String(filePath || '')).toLowerCase();
  if (base.endsWith('.pbm')) return true;
  if (base.includes('trace')) return true;
  return false;
}

export function sniffContentType(filePath, buf) {
  const ext = path.extname(filePath).toLowerCase();
  if (buf?.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'image/png';
  if (buf?.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf?.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1') return 'image/avif';
  }
  if (ext === '.svg' || (buf && /<svg[\s>]/i.test(buf.toString('utf8', 0, Math.min(buf.length, 512))))) {
    return 'image/svg+xml';
  }
  if (ext === '.icns') return 'image/x-icns';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.avif') return 'image/avif';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export function readPngDimensions(buf) {
  if (!buf || buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** SVG product-asset gate: no scripts, no external URLs, no embedded rasters. */
export function validateSvgMark(svgText) {
  const issues = [];
  const text = String(svgText || '');
  if (!/<svg[\s>]/i.test(text)) issues.push('missing_svg_root');
  if (/<script[\s>]/i.test(text)) issues.push('script_element');
  if (/on[a-z]+\s*=/i.test(text)) issues.push('inline_event_handler');
  if (/<image[\s>]/i.test(text)) issues.push('embedded_image_element');
  if (/xlink:href\s*=\s*["']https?:/i.test(text)) issues.push('external_xlink');
  if (/href\s*=\s*["']https?:/i.test(text)) issues.push('external_href');
  if (/data:image\//i.test(text)) issues.push('data_image_uri');
  return { ok: issues.length === 0, issues };
}

/**
 * Inspect a local asset file. Pure — no brand/product identity knowledge.
 */
export function inspectBrandAsset(filePath, { role = 'asset', buffer = null } = {}) {
  const abs = path.resolve(filePath);
  assert(!isExcludedIntermediate(abs), 'asset_excluded_intermediate', `Excluded intermediate: ${path.basename(abs)}`);
  assert(fs.existsSync(abs), 'asset_missing', `Asset not found: ${abs}`);

  const buf = buffer || fs.readFileSync(abs);
  const contentType = sniffContentType(abs, buf);
  const sha256 = sha256Buffer(buf);
  let width = null;
  let height = null;
  let alpha = null;

  if (contentType === 'image/png') {
    const dim = readPngDimensions(buf);
    if (dim) {
      width = dim.width;
      height = dim.height;
    }
    if (buf.length >= 26) {
      const colorType = buf[25];
      alpha = colorType === 4 || colorType === 6;
    }
  } else if (contentType === 'image/svg+xml') {
    const gate = validateSvgMark(buf.toString('utf8'));
    if (!gate.ok) {
      throw new BrandAssetError('svg_unsafe', `Unsafe SVG: ${gate.issues.join(',')}`, gate);
    }
  }

  return {
    role,
    path: abs,
    basename: path.basename(abs),
    bytes: buf.length,
    content_type: contentType,
    sha256,
    width,
    height,
    alpha,
  };
}

/** Alias used by public SDK surface. */
export const inspectLocalAsset = inspectBrandAsset;
