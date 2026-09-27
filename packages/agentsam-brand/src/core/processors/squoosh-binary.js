/**
 * Squoosh backend — maintained community BINARY only.
 * Never invoke @squoosh/cli via npx/npm.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectBrandAsset } from '../inspect.js';
import { BrandAssetError } from '../errors.js';

const SQUOOSH_BIN = process.env.AGENTSAM_SQUOOSH_PATH || 'squoosh';

export function hasSquooshBinary() {
  const r = spawnSync(SQUOOSH_BIN, ['--help'], { encoding: 'utf8' });
  if (r.error?.code === 'ENOENT') return false;
  return r.status === 0 || (r.stdout || r.stderr || '').includes('Usage: squoosh');
}

function squooshVersion() {
  const r = spawnSync(SQUOOSH_BIN, ['--version'], { encoding: 'utf8' });
  const text = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return text.split('\n')[0] || 'unknown';
}

function encoderFlag(format) {
  const f = String(format || '').toLowerCase();
  if (f === 'webp') return '--webp';
  if (f === 'avif') return '--avif';
  if (f === 'jxl') return '--jxl';
  if (f === 'wp2') return '--wp2';
  if (f === 'png' || f === 'oxipng') return '--oxipng';
  if (f === 'jpeg' || f === 'jpg' || f === 'mozjpeg') return '--mozjpeg';
  return null;
}

function encodeConfig(format, options = {}) {
  if (options.auto === true || options.auto === 'auto') return 'auto';
  const f = String(format || '').toLowerCase();
  if (f === 'webp' || f === 'mozjpeg' || f === 'jpeg' || f === 'jpg' || f === 'jxl' || f === 'wp2') {
    return JSON.stringify({ quality: options.quality ?? 80 });
  }
  if (f === 'avif') {
    return JSON.stringify({ cqLevel: options.cqLevel ?? 28 });
  }
  if (f === 'png' || f === 'oxipng') {
    return JSON.stringify({ level: options.level ?? 3 });
  }
  return 'auto';
}

function expectedExt(format) {
  const f = String(format || '').toLowerCase();
  if (f === 'jpeg' || f === 'jpg' || f === 'mozjpeg') return '.jpg';
  if (f === 'oxipng' || f === 'png') return '.png';
  if (f === 'webp') return '.webp';
  if (f === 'avif') return '.avif';
  if (f === 'jxl') return '.jxl';
  if (f === 'wp2') return '.wp2';
  return `.${f}`;
}

function findProduced(dir, ext) {
  if (!fs.existsSync(dir)) return null;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        const hit = walk(p);
        if (hit) return hit;
      } else if (!ext || name.toLowerCase().endsWith(ext)) {
        return p;
      }
    }
    return null;
  };
  return walk(dir);
}

export const squooshProcessor = {
  id: 'squoosh',
  label: 'Squoosh (maintained binary)',

  available() {
    return hasSquooshBinary();
  },

  async inspect(input) {
    const meta = inspectBrandAsset(input);
    meta.processor = 'squoosh';
    meta.processor_version = squooshVersion();
    return meta;
  },

  async resize(input, { width, height, method = 'lanczos3', outPath }) {
    if (!hasSquooshBinary()) {
      throw new BrandAssetError('processor_unavailable', 'squoosh binary not found (brew install squoosh)');
    }
    const outDir = path.dirname(outPath);
    fs.mkdirSync(outDir, { recursive: true });
    const tmpBase = path.join(outDir, `.squoosh-resize-${Date.now()}`);
    const cfg = JSON.stringify({
      width: width || undefined,
      height: height || undefined,
      method,
    });
    const r = spawnSync(
      SQUOOSH_BIN,
      ['--resize', cfg, '--oxipng', '{"level":2}', '-d', tmpBase, path.resolve(input)],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) {
      throw new BrandAssetError('derive_failed', r.stderr || r.stdout || 'squoosh resize failed');
    }
    const produced = findProduced(tmpBase, '.png') || findProduced(tmpBase, null);
    if (!produced) {
      throw new BrandAssetError('derive_failed', 'squoosh resize produced no file');
    }
    fs.renameSync(produced, outPath);
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const inspected = inspectBrandAsset(outPath);
    return {
      path: outPath,
      format: 'png',
      bytes: inspected.bytes,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      content_type: inspected.content_type,
      processor: 'squoosh',
      processor_version: squooshVersion(),
      options: { width, height, method },
    };
  },

  async encode(input, { format, quality, cqLevel, level, auto, outPath }) {
    if (!hasSquooshBinary()) {
      throw new BrandAssetError('processor_unavailable', 'squoosh binary not found');
    }
    const flag = encoderFlag(format);
    if (!flag) {
      throw new BrandAssetError('unsupported_format', `squoosh cannot encode ${format}`);
    }
    const outDir = path.dirname(outPath);
    fs.mkdirSync(outDir, { recursive: true });
    const tmpBase = path.join(outDir, `.squoosh-enc-${Date.now()}`);
    const cfg = encodeConfig(format, { quality, cqLevel, level, auto });
    const r = spawnSync(
      SQUOOSH_BIN,
      [flag, cfg, '-d', tmpBase, path.resolve(input)],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) {
      throw new BrandAssetError('derive_failed', r.stderr || r.stdout || 'squoosh encode failed');
    }
    const ext = expectedExt(format);
    const produced = findProduced(tmpBase, ext) || findProduced(tmpBase, null);
    if (!produced) {
      throw new BrandAssetError('derive_failed', 'squoosh encode produced no file');
    }
    fs.renameSync(produced, outPath);
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    const inspected = inspectBrandAsset(outPath);
    return {
      path: outPath,
      format: String(format).toLowerCase().replace('mozjpeg', 'jpeg').replace('oxipng', 'png'),
      bytes: inspected.bytes,
      width: inspected.width,
      height: inspected.height,
      sha256: inspected.sha256,
      content_type: inspected.content_type,
      processor: 'squoosh',
      processor_version: squooshVersion(),
      options: { format, quality, cqLevel, level, auto },
    };
  },

  async optimize(input, options = {}) {
    const format = options.format || 'webp';
    return this.encode(input, {
      ...options,
      format,
      auto: options.auto !== false ? (options.auto || 'auto') : undefined,
    });
  },
};
