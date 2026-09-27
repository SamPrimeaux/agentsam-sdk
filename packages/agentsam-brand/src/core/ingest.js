/**
 * Brand asset ingest — path, URL, stdin (-), drop-folder.
 * Never seeds product brand defaults (no agentsam / Downloads paths).
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BrandAssetError } from './errors.js';
import { isExcludedIntermediate } from './inspect.js';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico', '.icns']);

export function expandHome(p) {
  const s = String(p || '').trim().replace(/^['"]|['"]$/g, '');
  if (!s) return s;
  if (s.startsWith('~/')) return path.join(os.homedir(), s.slice(2));
  return path.resolve(s);
}

/** Sniff common image magic bytes → extension + content-type */
export function sniffImageBuffer(buf) {
  if (!buf || buf.length < 3) return null;
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: '.png', contentType: 'image/png' };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: '.jpg', contentType: 'image/jpeg' };
  }
  if (buf.length >= 3 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { ext: '.gif', contentType: 'image/gif' };
  }
  // RIFF....WEBP
  if (
    buf.length >= 12
    && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return { ext: '.webp', contentType: 'image/webp' };
  }
  // ftyp....avif (ISO BMFF)
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (brand.includes('avif') || brand.includes('avis')) {
      return { ext: '.avif', contentType: 'image/avif' };
    }
  }
  const head = buf.slice(0, Math.min(256, buf.length)).toString('utf8').trimStart();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) {
    return { ext: '.svg', contentType: 'image/svg+xml' };
  }
  return null;
}

/**
 * Read stdin binary when --source - or stdin is piped (non-TTY).
 */
export async function readStdinImage(options = {}) {
  const { workDir, stdin = process.stdin } = options;
  if (!workDir) throw new BrandAssetError('work_dir_required', 'workDir required for stdin ingest');
  fs.mkdirSync(workDir, { recursive: true });

  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const buf = Buffer.concat(chunks);
  if (buf.length < 16) {
    throw new BrandAssetError('stdin_empty', 'stdin produced no image bytes (pipe a PNG/JPEG/WebP/SVG)');
  }
  const sniffed = sniffImageBuffer(buf);
  if (!sniffed) {
    throw new BrandAssetError('stdin_unknown_type', 'Could not sniff image type from stdin');
  }
  const dest = path.join(workDir, `stdin-source${sniffed.ext}`);
  fs.writeFileSync(dest, buf);
  return {
    path: dest,
    contentType: sniffed.contentType,
    bytes: buf.length,
    source: 'stdin',
  };
}

export function isImagePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

/**
 * Scan a drop folder once; pick largest PNG (or first image) + optional SVG mark.
 */
export function scanDropFolder(dirPath) {
  const dir = expandHome(dirPath);
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new BrandAssetError('drop_dir_missing', `Drop folder not found: ${dirPath}`);
  }
  const files = fs.readdirSync(dir)
    .map((n) => path.join(dir, n))
    .filter((f) => {
      try {
        return fs.statSync(f).isFile() && !isExcludedIntermediate(f) && isImagePath(f);
      } catch {
        return false;
      }
    });

  const pngs = files
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  const svgs = files.filter((f) => f.toLowerCase().endsWith('.svg'));
  const others = files.filter((f) => !f.toLowerCase().endsWith('.png') && !f.toLowerCase().endsWith('.svg'))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

  const sourcePath = pngs[0] || others[0] || null;
  const markPath = svgs.find((f) => /\.min\.svg$/i.test(f)) || svgs[0] || null;

  return {
    dir,
    sourcePath,
    markPath,
    files,
    heuristics: {
      source: sourcePath ? path.basename(sourcePath) : null,
      mark: markPath ? path.basename(markPath) : null,
    },
  };
}

/**
 * Poll drop-dir until a usable image appears or timeout.
 * @param {{ dir: string, timeoutMs?: number, intervalMs?: number }} options
 */
export async function waitForDrop(options = {}) {
  const dir = expandHome(options.dir);
  const timeoutMs = Number(options.timeoutMs ?? 120_000);
  const intervalMs = Number(options.intervalMs ?? 800);
  const started = Date.now();
  fs.mkdirSync(dir, { recursive: true });

  while (Date.now() - started < timeoutMs) {
    const scan = scanDropFolder(dir);
    if (scan.sourcePath || scan.markPath) return scan;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new BrandAssetError(
    'drop_timeout',
    `No image appeared in ${dir} within ${Math.round(timeoutMs / 1000)}s — drop a PNG/SVG and retry`,
  );
}

/**
 * Resolve --source flag: path, -, or empty (caller may use drop-dir).
 */
export async function resolveSourceInput({
  source,
  dropDir,
  watch = false,
  workDir,
  cwd = process.cwd(),
} = {}) {
  const src = String(source || '').trim();

  if (src === '-' || src === '/dev/stdin') {
    return readStdinImage({ workDir: workDir || path.join(cwd, '.agentsam', 'brand', 'work', 'stdin') });
  }

  if (src) {
    const abs = expandHome(src);
    if (!fs.existsSync(abs)) {
      throw new BrandAssetError('source_missing', `Source not found: ${src}`);
    }
    if (isExcludedIntermediate(abs)) {
      throw new BrandAssetError('source_intermediate', 'Tracing / .pbm intermediates are not product assets');
    }
    return { path: abs, source: 'path', contentType: null, bytes: fs.statSync(abs).size };
  }

  if (dropDir) {
    const scan = watch
      ? await waitForDrop({ dir: dropDir })
      : scanDropFolder(dropDir);
    if (!scan.sourcePath && !scan.markPath) {
      throw new BrandAssetError('drop_empty', `No usable images in ${dropDir}`);
    }
    return {
      path: scan.sourcePath || scan.markPath,
      markPath: scan.markPath,
      source: 'drop',
      heuristics: scan.heuristics,
      bytes: scan.sourcePath ? fs.statSync(scan.sourcePath).size : 0,
    };
  }

  return null;
}
