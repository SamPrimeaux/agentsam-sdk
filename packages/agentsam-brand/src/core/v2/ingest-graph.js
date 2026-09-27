/**
 * BrandPack v2 ingest — folders, archives (zip/tar/gz), HTML/CSS/code extraction.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { BrandAssetError } from '../errors.js';
import { expandHome, isImagePath } from '../ingest.js';
import { INGEST_EXTENSIONS, formatCapabilities } from '../capabilities.js';
import { classifyAssetRole } from './roles.js';
import {
  createEmptyBrandPack,
  normalizeBrandPack,
  normalizeAssetNode,
  touchProvenance,
  BRAND_PACK_FILENAME,
} from './schema.js';
import { sha256File } from '../inspect.js';

const ARCHIVE_EXTS = new Set(['.zip', '.tar', '.gz', '.tgz', '.tar.gz']);
const CODE_EXTS = new Set(['.html', '.htm', '.css', '.scss', '.js', '.ts', '.tsx', '.jsx', '.vue', '.svelte', '.json', '.md', '.yaml', '.yml']);

function extOf(filePath) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.endsWith('.tar.gz')) return '.tar.gz';
  return path.extname(lower);
}

export function isArchivePath(filePath) {
  return ARCHIVE_EXTS.has(extOf(filePath));
}

export function isIngestiblePath(filePath) {
  const ext = extOf(filePath);
  if (ARCHIVE_EXTS.has(ext)) return true;
  if (INGEST_EXTENSIONS.includes(ext)) return true;
  if (CODE_EXTS.has(ext)) return true;
  return isImagePath(filePath);
}

/**
 * Extract archive to a work directory (uses system unzip/tar).
 */
export function extractArchive(archivePath, destDir) {
  const abs = path.resolve(archivePath);
  const ext = extOf(abs);
  fs.mkdirSync(destDir, { recursive: true });

  if (ext === '.zip') {
    const r = spawnSync('unzip', ['-q', '-o', abs, '-d', destDir], { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new BrandAssetError('unzip_failed', r.stderr || 'unzip failed');
    }
    return destDir;
  }
  if (ext === '.tar' || ext === '.tgz' || ext === '.tar.gz') {
    const args = ext === '.tar' ? ['-xf', abs, '-C', destDir] : ['-xzf', abs, '-C', destDir];
    const r = spawnSync('tar', args, { encoding: 'utf8' });
    if (r.status !== 0) {
      throw new BrandAssetError('tar_failed', r.stderr || 'tar failed');
    }
    return destDir;
  }
  if (ext === '.gz' && !abs.endsWith('.tar.gz')) {
    const outName = path.basename(abs, '.gz');
    const outPath = path.join(destDir, outName);
    fs.writeFileSync(outPath, zlib.gunzipSync(fs.readFileSync(abs)));
    return destDir;
  }
  throw new BrandAssetError('archive_unsupported', `Unsupported archive: ${ext}`);
}

/**
 * Extract colors, font-families, image urls from HTML/CSS/JS text.
 */
export function extractFromCode(sourceText, { filePath = '' } = {}) {
  const text = String(sourceText || '');
  const colors = new Set();
  const fonts = new Set();
  const urls = new Set();
  const cssVars = {};

  const hexRe = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
  const rgbRe = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)/gi;
  const oklchRe = /oklch\(\s*[^)]+\)/gi;
  const fontRe = /font-family\s*:\s*([^;!}{]+)/gi;
  const urlRe = /url\(\s*['"]?([^'")\s]+)['"]?\s*\)/gi;
  const srcRe = /(?:src|href)=['"]([^'"]+\.(?:png|jpe?g|webp|avif|svg|gif|woff2?|ttf|otf|mp4|webm|glb))['"]/gi;
  const varRe = /--([a-zA-Z0-9-_]+)\s*:\s*([^;]+);/g;

  for (const m of text.matchAll(hexRe)) colors.add(m[0].toLowerCase());
  for (const m of text.matchAll(rgbRe)) colors.add(m[0].replace(/\s+/g, ''));
  for (const m of text.matchAll(oklchRe)) colors.add(m[0].replace(/\s+/g, ' '));
  for (const m of text.matchAll(fontRe)) {
    const raw = m[1].split(',')[0].replace(/['"]/g, '').trim();
    if (raw && !/^(inherit|initial|sans-serif|serif|monospace|system-ui)$/i.test(raw)) {
      fonts.add(raw);
    }
  }
  for (const m of text.matchAll(urlRe)) urls.add(m[1]);
  for (const m of text.matchAll(srcRe)) urls.add(m[1]);
  for (const m of text.matchAll(varRe)) {
    cssVars[`--${m[1]}`] = m[2].trim();
  }

  return {
    file: filePath || null,
    colors: [...colors].slice(0, 64),
    fonts: [...fonts].slice(0, 32),
    asset_urls: [...urls].slice(0, 128),
    css_variables: cssVars,
  };
}

function walkFiles(root, { maxFiles = 5000 } = {}) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === '__MACOSX') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile()) out.push(full);
    }
  }
  return out;
}

function classifyFile(filePath, rootDir) {
  const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const ext = extOf(filePath).replace(/^\./, '');
  const caps = formatCapabilities(ext);
  const classification = classifyAssetRole({ path: filePath, contentType: null });
  let bytes = 0;
  try { bytes = fs.statSync(filePath).size; } catch { /* ignore */ }

  const node = normalizeAssetNode({
    id: `asset_${rel.replace(/[^a-z0-9]+/gi, '_').slice(0, 64)}`,
    role: classification.role,
    family: classification.family,
    label: path.basename(filePath),
    master: {
      path: filePath,
      relative: rel,
      format: ext || null,
      bytes,
      sha256: bytes < 50_000_000 ? safeSha(filePath) : null,
    },
    provenance: {
      source: 'ingest',
      confidence: classification.confidence,
      needs_review: classification.needs_review,
    },
    licensing: caps.licensing_required
      ? { redistributable: false, status: 'unknown', note: 'Font licensing must be confirmed before ZIP export' }
      : null,
  });

  return {
    asset: node,
    classification,
    caps,
  };
}

function safeSha(filePath) {
  try { return sha256File(filePath); } catch { return null; }
}

/**
 * Ingest a path (file, folder, or archive) into a brand.pack.json graph.
 */
export async function ingestBrandSources(inputPath, options = {}) {
  const cwd = options.cwd || process.cwd();
  const abs = expandHome(inputPath);
  if (!abs || !fs.existsSync(abs)) {
    throw new BrandAssetError('ingest_missing', `Not found: ${inputPath}`);
  }

  const workRoot = options.workDir
    || path.join(cwd, '.agentsam', 'brand', 'ingest', `run-${Date.now()}`);
  fs.mkdirSync(workRoot, { recursive: true });

  let scanRoot = abs;
  const extracted = [];

  if (fs.statSync(abs).isFile() && isArchivePath(abs)) {
    const dest = path.join(workRoot, 'extracted');
    extractArchive(abs, dest);
    scanRoot = dest;
    extracted.push(abs);
  } else if (fs.statSync(abs).isFile()) {
    scanRoot = path.dirname(abs);
  }

  // Also expand nested archives one level
  if (fs.statSync(scanRoot).isDirectory()) {
    for (const f of walkFiles(scanRoot, { maxFiles: 200 })) {
      if (isArchivePath(f) && f !== abs) {
        const nested = path.join(workRoot, 'nested', path.basename(f, extOf(f)));
        try {
          extractArchive(f, nested);
          extracted.push(f);
        } catch {
          /* keep going */
        }
      }
    }
  }

  const roots = [scanRoot];
  if (fs.existsSync(path.join(workRoot, 'nested'))) {
    roots.push(...fs.readdirSync(path.join(workRoot, 'nested')).map((n) => path.join(workRoot, 'nested', n)));
  }

  let pack = options.pack
    ? normalizeBrandPack(options.pack)
    : createEmptyBrandPack({ brandId: options.brandId || '', brandName: options.brandName || '' });

  if (!pack.brand.id && options.brandId) pack.brand.id = String(options.brandId).toLowerCase();

  const detections = [];
  const codeExtractions = [];
  const recommendations = [];
  const seenSha = new Map();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const files = fs.statSync(root).isFile()
      ? [root]
      : walkFiles(root).filter(isIngestiblePath);

    // Single-file ingest when user pointed at one file
    if (fs.statSync(abs).isFile() && !isArchivePath(abs)) {
      files.length = 0;
      files.push(abs);
    }

    for (const file of files) {
      const ext = extOf(file);
      if (ARCHIVE_EXTS.has(ext)) continue;

      if (CODE_EXTS.has(ext) || ext === '.html' || ext === '.htm') {
        try {
          const text = fs.readFileSync(file, 'utf8');
          const extractedCode = extractFromCode(text, { filePath: file });
          codeExtractions.push(extractedCode);
          // Merge CSS vars / colors into tokens (soft)
          for (const [k, v] of Object.entries(extractedCode.css_variables || {})) {
            if (!pack.tokens.color[k]) {
              pack.tokens.color[k] = { value: v, source: path.basename(file), inferred: true };
            }
          }
          let fi = 0;
          for (const font of extractedCode.fonts) {
            const key = `font.inferred.${fi++}`;
            if (!pack.tokens.type[key]) {
              pack.tokens.type[key] = { family: font, source: path.basename(file), inferred: true };
            }
          }
        } catch {
          /* binary masquerading */
        }
      }

      if (!isIngestiblePath(file)) continue;
      // Skip pure code from asset list unless it's tokens/docs
      if (['.js', '.ts', '.tsx', '.jsx', '.vue', '.svelte'].includes(ext)) continue;

      const { asset, classification } = classifyFile(file, root);
      const sha = asset.master?.sha256;
      if (sha && seenSha.has(sha)) {
        recommendations.push({
          type: 'duplicate',
          message: `${path.basename(file)} duplicates ${seenSha.get(sha)}`,
          path: file,
        });
        continue;
      }
      if (sha) seenSha.set(sha, asset.master.relative || file);

      pack.assets.push(asset);
      detections.push({
        path: asset.master?.relative || file,
        role: classification.role,
        confidence: classification.confidence,
        ok: classification.confidence >= 0.7,
        label: classification.label,
      });
    }
  }

  // Recommendations
  const roles = new Set(pack.assets.map((a) => a.role));
  if (roles.has('logo.primary') === false && pack.assets.some((a) => a.family === 'logo')) {
    /* ok */
  }
  if (!roles.has('logo.primary') && !roles.has('logo.mark')) {
    recommendations.push({ type: 'missing', message: 'No primary logo / mark detected' });
  }
  if (!roles.has('favicon') && !roles.has('icon.app')) {
    recommendations.push({ type: 'missing', message: 'No favicon or app icon detected' });
  }
  if (roles.has('hero.landscape') && !roles.has('hero.mobile')) {
    recommendations.push({ type: 'missing', message: 'Desktop hero found but no mobile hero — consider art-direction crop' });
  }
  for (const a of pack.assets) {
    if (a.provenance?.needs_review) {
      recommendations.push({
        type: 'review',
        message: `Low-confidence classification for ${a.label || a.id} → ${a.role}`,
        asset_id: a.id,
      });
    }
    if (a.licensing?.status === 'unknown') {
      recommendations.push({
        type: 'licensing',
        message: `Font ${a.label} cannot be redistributed until licensing is confirmed`,
        asset_id: a.id,
      });
    }
  }

  pack = touchProvenance(pack, {
    op: 'ingest',
    input: abs,
    asset_count: pack.assets.length,
    archives: extracted.map((p) => path.basename(p)),
  });

  const outDir = options.outDir || path.join(cwd, '.agentsam', 'brand', 'packs', pack.brand.id || 'untitled');
  fs.mkdirSync(outDir, { recursive: true });
  const packPath = path.join(outDir, BRAND_PACK_FILENAME);
  if (options.write !== false) {
    fs.writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`);
  }

  return {
    ok: true,
    capability: 'brand.ingest',
    pack,
    pack_path: packPath,
    detections,
    code_extractions: codeExtractions,
    recommendations,
    stats: {
      assets: pack.assets.length,
      high_confidence: detections.filter((d) => d.ok).length,
      needs_review: detections.filter((d) => !d.ok).length,
      archives_expanded: extracted.length,
      tokens_color: Object.keys(pack.tokens.color).length,
      tokens_type: Object.keys(pack.tokens.type).length,
    },
  };
}

export async function loadBrandPack(fromPath, { cwd = process.cwd() } = {}) {
  const abs = path.resolve(cwd, fromPath);
  if (fs.statSync(abs).isDirectory()) {
    const candidate = path.join(abs, BRAND_PACK_FILENAME);
    if (fs.existsSync(candidate)) {
      return normalizeBrandPack(JSON.parse(fs.readFileSync(candidate, 'utf8')));
    }
    throw new BrandAssetError('pack_missing', `No ${BRAND_PACK_FILENAME} in ${fromPath}`);
  }
  return normalizeBrandPack(JSON.parse(fs.readFileSync(abs, 'utf8')));
}

export function saveBrandPack(pack, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, BRAND_PACK_FILENAME);
  const normalized = normalizeBrandPack(pack);
  normalized.provenance = {
    ...normalized.provenance,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`);
  return file;
}
