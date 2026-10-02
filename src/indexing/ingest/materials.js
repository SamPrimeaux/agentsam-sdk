/**
 * Material intake for codebaseindex.ingest — paths pasted/dropped into the CLI.
 * Archives are inspected first and selectively mined instead of blindly unpacked.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { isCodeSourceExtension, isDocumentSourceExtension } from '../../../packages/agentsam-repository/src/source-types.js';

const ARCHIVE_EXT = new Set(['.zip', '.tar', '.tgz', '.gz', '.tar.gz', '.tbz2', '.tar.bz2']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif']);
const MODEL_3D_EXT = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.usdz']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv', '.avi', '.mpeg', '.mpg']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const TEXT_BASENAMES = new Set([
  'readme', 'license', 'licence', 'dockerfile', 'makefile', 'procfile', 'gemfile', 'rakefile',
  'cargo.lock', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', '.gitignore', '.npmrc', '.editorconfig',
]);
const DEFAULT_ARCHIVE_POLICY = Object.freeze({
  maxEntries: 10_000,
  maxFiles: 2_000,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
  includeAssets: false,
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function extOf(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tar.gz')) return '.tar.gz';
  if (lower.endsWith('.tar.bz2')) return '.tar.bz2';
  return path.extname(lower);
}

/**
 * Parse pasted CLI text into filesystem paths (one per line / whitespace-separated quoted).
 * Terminal drag-drop typically pastes absolute paths; multi-line paste is supported.
 * @param {string} text
 * @returns {string[]}
 */
export function parsePastedPaths(text) {
  const raw = clean(text);
  if (!raw) return [];
  const paths = [];
  const re = /"([^"]+)"|'([^']+)'|(`([^`]+)`)|(\S+)/g;
  let match;
  while ((match = re.exec(raw))) {
    const candidate = match[1] || match[2] || match[4] || match[5];
    if (!candidate || candidate.startsWith('-')) continue;
    paths.push(candidate.replace(/\\ /g, ' '));
  }
  return [...new Set(paths)];
}

/** @param {string} filePath */
export function classifyMaterial(filePath) {
  const resolved = path.resolve(filePath);
  const ext = extOf(resolved);
  const exists = fs.existsSync(resolved);
  const stat = exists ? fs.statSync(resolved) : null;
  let kind = 'unknown';
  if (stat?.isDirectory()) kind = 'directory';
  else if (ARCHIVE_EXT.has(ext) || resolved.toLowerCase().endsWith('.tar.gz')) kind = 'archive';
  else if (IMAGE_EXT.has(ext)) kind = 'image';
  else if (MODEL_3D_EXT.has(ext)) kind = 'model3d';
  else if (isDocumentSourceExtension(ext)) kind = 'document';
  else if (isCodeSourceExtension(ext)) kind = 'code';
  else if (stat?.isFile()) kind = 'file';
  return {
    path: resolved,
    exists,
    kind,
    ext,
    bytes: stat?.isFile() ? stat.size : null,
    sha256: stat?.isFile() && stat.size <= 32 * 1024 * 1024 ? hashFile(resolved) : null,
  };
}

function hashFile(filePath) {
  try {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function hasBin(name) {
  const result = spawnSync(name, ['--help'], { stdio: 'ignore' });
  return result.error == null;
}

function archiveFormat(archivePath) {
  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
    || lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2')) return 'tar';
  if (lower.endsWith('.gz')) return 'gzip';
  return null;
}

function archiveEntryKind(entryPath) {
  const normalized = String(entryPath || '').replace(/\\/g, '/');
  const ext = path.posix.extname(normalized.toLowerCase());
  const base = path.posix.basename(normalized).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (MODEL_3D_EXT.has(ext)) return 'model3d';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (isDocumentSourceExtension(ext) || TEXT_BASENAMES.has(base)) return 'document';
  if (isCodeSourceExtension(ext)) return 'code';
  return 'file';
}

function isSafeArchivePath(entryPath) {
  const raw = String(entryPath || '').replace(/\\/g, '/');
  if (!raw || raw.includes('\0') || raw.startsWith('/') || /^[a-zA-Z]:\//.test(raw)) return false;
  const parts = raw.split('/').filter((part) => part && part !== '.');
  return !parts.includes('..');
}

function shouldMineArchiveEntry(entry, policy) {
  if (!entry.safe) return { selected: false, reason: 'unsafe_path' };
  if (entry.link) return { selected: false, reason: 'link_entry' };
  if (entry.directory) return { selected: false, reason: 'directory' };
  if (Number.isFinite(entry.bytes) && entry.bytes > policy.maxEntryBytes) {
    return { selected: false, reason: 'entry_too_large' };
  }
  if (entry.kind === 'code' || entry.kind === 'document') return { selected: true, reason: 'indexable_text' };
  if (policy.includeAssets && ['image', 'model3d'].includes(entry.kind)) return { selected: true, reason: 'requested_asset' };
  return { selected: false, reason: ['image', 'model3d', 'video', 'audio'].includes(entry.kind) ? 'asset_inventory_only' : 'non_indexable' };
}

function commandText(command, args, maxBuffer = 16 * 1024 * 1024) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer,
    env: { ...process.env, LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function zipSizeMap(archivePath) {
  if (!hasBin('zipinfo')) return new Map();
  const map = new Map();
  const lines = commandText('zipinfo', ['-l', archivePath], 32 * 1024 * 1024).split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^(\S+)\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+(.*)$/);
    if (!match) continue;
    map.set(match[3], { bytes: Number(match[2]), link: match[1].startsWith('l') });
  }
  return map;
}

/**
 * Inspect an archive without expanding it to disk.
 * @param {string} archivePath
 * @param {Partial<typeof DEFAULT_ARCHIVE_POLICY>} [options]
 */
export function inspectArchive(archivePath, options = {}) {
  const resolved = path.resolve(archivePath);
  const policy = { ...DEFAULT_ARCHIVE_POLICY, ...options };
  const format = archiveFormat(resolved);
  if (!format) throw new Error(`unsupported_archive:${path.basename(resolved)}`);
  if (!fs.existsSync(resolved)) throw new Error(`archive_missing:${resolved}`);

  let names = [];
  let zipMeta = new Map();
  let tarLinks = new Set();
  if (format === 'zip') {
    if (!hasBin('unzip')) throw new Error('unzip_unavailable: install unzip to inspect .zip materials');
    names = commandText('unzip', ['-Z1', resolved], 32 * 1024 * 1024).split(/\r?\n/).filter(Boolean);
    zipMeta = zipSizeMap(resolved);
  } else if (format === 'tar') {
    if (!hasBin('tar')) throw new Error('tar_unavailable: install tar to inspect tar materials');
    names = commandText('tar', ['-tf', resolved], 32 * 1024 * 1024).split(/\r?\n/).filter(Boolean);
    const verbose = commandText('tar', ['-tvf', resolved], 32 * 1024 * 1024).split(/\r?\n/);
    for (const line of verbose) {
      if (!(line.startsWith('l') || line.startsWith('h'))) continue;
      const marker = line.includes(' -> ') ? line.split(' -> ')[0] : line;
      const name = names.find((candidate) => marker.endsWith(candidate));
      if (name) tarLinks.add(name);
    }
  } else {
    if (!hasBin('gzip')) throw new Error('gzip_unavailable: install gzip to inspect .gz materials');
    names = [path.basename(resolved, '.gz') || 'payload'];
  }

  if (names.length > policy.maxEntries) {
    const error = new Error(`archive_entry_limit_exceeded:${names.length}>${policy.maxEntries}`);
    error.code = 'AGENTSAM_ARCHIVE_ENTRY_LIMIT';
    throw error;
  }

  const entries = names.map((name) => {
    const meta = zipMeta.get(name) || {};
    const directory = name.endsWith('/');
    const entry = {
      path: name,
      bytes: Number.isFinite(meta.bytes) ? meta.bytes : null,
      kind: directory ? 'directory' : archiveEntryKind(name),
      directory,
      link: Boolean(meta.link || tarLinks.has(name)),
      safe: isSafeArchivePath(name),
    };
    return { ...entry, ...shouldMineArchiveEntry(entry, policy) };
  });

  const unsafe = entries.filter((entry) => !entry.safe);
  if (unsafe.length) {
    const error = new Error(`archive_unsafe_paths:${unsafe.slice(0, 5).map((entry) => entry.path).join(',')}`);
    error.code = 'AGENTSAM_ARCHIVE_UNSAFE_PATH';
    throw error;
  }

  const selected = entries.filter((entry) => entry.selected);
  const selectedKnownBytes = selected.reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  const byKind = {};
  for (const entry of entries) byKind[entry.kind] = (byKind[entry.kind] || 0) + 1;

  return {
    schema: 'agentsam.archive.inspect.v1',
    archive: resolved,
    format,
    compressed_bytes: fs.statSync(resolved).size,
    entries_total: entries.length,
    selected_total: selected.length,
    selected_known_bytes: selectedKnownBytes,
    by_kind: byKind,
    policy,
    entries,
  };
}

function readArchiveEntry(archivePath, format, entry, maxBytes) {
  const maxBuffer = Math.max(1024 * 1024, maxBytes + 1);
  if (format === 'zip') {
    return execFileSync('unzip', ['-p', archivePath, entry], { encoding: null, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  if (format === 'tar') {
    return execFileSync('tar', ['-xOf', archivePath, entry], { encoding: null, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
  }
  return execFileSync('gzip', ['-dc', archivePath], { encoding: null, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * Selectively mine indexable content from an archive into destDir.
 * Large/binary/media members remain represented in the receipt but are not copied.
 * @param {string} archivePath
 * @param {string} destDir
 * @param {Partial<typeof DEFAULT_ARCHIVE_POLICY>} [options]
 */
export function extractArchive(archivePath, destDir, options = {}) {
  const policy = { ...DEFAULT_ARCHIVE_POLICY, ...options };
  const inspection = inspectArchive(archivePath, policy);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const selected = inspection.entries.filter((entry) => entry.selected);
  const mined = [];
  const skipped = inspection.entries.filter((entry) => !entry.selected).map((entry) => ({
    path: entry.path, kind: entry.kind, bytes: entry.bytes, reason: entry.reason,
  }));
  let totalBytes = 0;

  for (const entry of selected) {
    if (mined.length >= policy.maxFiles) {
      skipped.push({ path: entry.path, kind: entry.kind, bytes: entry.bytes, reason: 'file_limit' });
      continue;
    }
    if (Number.isFinite(entry.bytes) && totalBytes + entry.bytes > policy.maxTotalBytes) {
      skipped.push({ path: entry.path, kind: entry.kind, bytes: entry.bytes, reason: 'total_byte_limit' });
      continue;
    }

    let payload;
    try {
      payload = readArchiveEntry(inspection.archive, inspection.format, entry.path, policy.maxEntryBytes);
    } catch (cause) {
      skipped.push({ path: entry.path, kind: entry.kind, bytes: entry.bytes, reason: 'extract_error', error: String(cause?.message || cause).slice(0, 240) });
      continue;
    }
    if (payload.length > policy.maxEntryBytes || totalBytes + payload.length > policy.maxTotalBytes) {
      skipped.push({ path: entry.path, kind: entry.kind, bytes: payload.length, reason: payload.length > policy.maxEntryBytes ? 'entry_too_large' : 'total_byte_limit' });
      continue;
    }

    const normalized = entry.path.replace(/\\/g, '/').replace(/^\.\//, '');
    const output = path.resolve(destDir, ...normalized.split('/'));
    const root = path.resolve(destDir);
    if (!(output === root || output.startsWith(`${root}${path.sep}`))) {
      throw new Error(`archive_unsafe_output:${entry.path}`);
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, payload);
    totalBytes += payload.length;
    mined.push({ path: entry.path, kind: entry.kind, bytes: payload.length });
  }

  return {
    schema: 'agentsam.archive.mine.v1',
    format: inspection.format,
    dest: destDir,
    entries_total: inspection.entries_total,
    mined_files: mined.length,
    mined_bytes: totalBytes,
    skipped_files: skipped.length,
    by_kind: inspection.by_kind,
    policy,
    mined,
    skipped: skipped.slice(0, 200),
    skipped_truncated: skipped.length > 200,
  };
}

/**
 * Stage pasted/dropped materials under `.agentsam/ingest/<id>/`.
 * Archives are inspected + selectively mined; files/dirs are copied or linked by relative include paths.
 *
 * @param {{ root: string, materials: string[], ingestId?: string, archivePolicy?: object }} opts
 */
export function stageMaterials(opts) {
  const root = path.resolve(opts.root);
  const ingestId = opts.ingestId || `ing_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const stageRoot = path.join(root, '.agentsam', 'ingest', ingestId);
  fs.mkdirSync(stageRoot, { recursive: true });

  const items = [];
  const include = [];
  const assets = [];

  for (const raw of opts.materials) {
    const classified = classifyMaterial(raw);
    if (!classified.exists) {
      items.push({ ...classified, status: 'missing' });
      continue;
    }

    if (classified.kind === 'archive') {
      const dest = path.join(stageRoot, 'archives', path.basename(classified.path, classified.ext) || 'archive');
      const extracted = extractArchive(classified.path, dest, opts.archivePolicy || {});
      const rel = path.relative(root, dest);
      if (extracted.mined_files > 0) include.push(rel);
      items.push({ ...classified, status: 'mined', stage: dest, extract: extracted });
      continue;
    }

    if (classified.kind === 'directory') {
      const relInside = classified.path.startsWith(`${root}${path.sep}`) || classified.path === root
        ? path.relative(root, classified.path) || '.'
        : null;
      if (relInside != null) {
        include.push(relInside === '' ? '.' : relInside);
        items.push({ ...classified, status: 'included', include: relInside || '.' });
      } else {
        const dest = path.join(stageRoot, 'trees', path.basename(classified.path) || 'tree');
        copyTree(classified.path, dest);
        const rel = path.relative(root, dest);
        include.push(rel);
        items.push({ ...classified, status: 'copied', stage: dest });
      }
      continue;
    }

    const destDir = path.join(stageRoot, classified.kind === 'image' ? 'images'
      : classified.kind === 'model3d' ? 'models3d'
        : classified.kind === 'document' ? 'documents'
          : 'files');
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, path.basename(classified.path));
    fs.copyFileSync(classified.path, dest);
    const rel = path.relative(root, dest);
    include.push(path.dirname(rel));
    assets.push({
      kind: classified.kind,
      path: rel,
      bytes: classified.bytes,
      sha256: classified.sha256,
      ext: classified.ext,
    });
    items.push({ ...classified, status: 'staged', stage: dest, include: path.dirname(rel) });
  }

  const uniqueInclude = [...new Set(include.map((p) => p.replace(/\\/g, '/').replace(/\/$/, '') || '.'))].sort();
  const manifest = {
    schema: 'agentsam.ingest.materials.v2',
    ingest_id: ingestId,
    staged_at: new Date().toISOString(),
    stage_root: path.relative(root, stageRoot),
    items,
    assets,
    include: uniqueInclude,
  };
  fs.writeFileSync(path.join(stageRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.agentsam') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}
