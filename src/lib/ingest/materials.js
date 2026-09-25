/**
 * Material intake for codebaseindex.ingest — paths pasted/dropped into the CLI.
 * Handles archives (tar/zip), sites/builds, HTML, images, GLB, and mixed trees.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

const ARCHIVE_EXT = new Set(['.zip', '.tar', '.tgz', '.gz', '.tar.gz', '.tbz2', '.tar.bz2']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif']);
const MODEL_3D_EXT = new Set(['.glb', '.gltf', '.obj', '.fbx', '.stl', '.usdz']);
const DOC_EXT = new Set(['.html', '.htm', '.md', '.txt', '.css', '.scss', '.json', '.xml', '.csv']);
const CODE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java', '.kt',
  '.swift', '.c', '.h', '.cpp', '.cc', '.cs', '.rb', '.php', '.sql', '.sh', '.bash',
  '.zsh', '.yaml', '.yml', '.toml', '.vue', '.svelte',
]);

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

/**
 * @param {string} filePath
 */
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
  else if (DOC_EXT.has(ext)) kind = 'document';
  else if (CODE_EXT.has(ext)) kind = 'code';
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
  // Some tools exit non-zero on --help; presence of spawn failure matters more.
  return result.error == null;
}

/**
 * Extract archive into destDir. Uses host tar/unzip (no extra npm deps).
 * @param {string} archivePath
 * @param {string} destDir
 */
export function extractArchive(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const lower = archivePath.toLowerCase();
  if (lower.endsWith('.zip')) {
    if (!hasBin('unzip')) throw new Error('unzip_unavailable: install unzip to extract .zip materials');
    execFileSync('unzip', ['-q', '-o', archivePath, '-d', destDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    return { tool: 'unzip', dest: destDir };
  }
  if (lower.endsWith('.tar') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz')
    || lower.endsWith('.tar.bz2') || lower.endsWith('.tbz2') || lower.endsWith('.gz')) {
    if (!hasBin('tar')) throw new Error('tar_unavailable: install tar to extract archive materials');
    execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: ['ignore', 'pipe', 'pipe'] });
    return { tool: 'tar', dest: destDir };
  }
  throw new Error(`unsupported_archive:${path.basename(archivePath)}`);
}

/**
 * Stage pasted/dropped materials under `.agentsam/ingest/<id>/`.
 * Archives are extracted; files/dirs are copied or linked by relative include paths.
 *
 * @param {{ root: string, materials: string[], ingestId?: string }} opts
 */
export function stageMaterials(opts) {
  const root = path.resolve(opts.root);
  const ingestId = opts.ingestId || `ing_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const stageRoot = path.join(root, '.agentsam', 'ingest', ingestId);
  fs.mkdirSync(stageRoot, { recursive: true });

  /** @type {object[]} */
  const items = [];
  /** @type {string[]} */
  const include = [];
  /** @type {object[]} */
  const assets = [];

  for (const raw of opts.materials) {
    const classified = classifyMaterial(raw);
    if (!classified.exists) {
      items.push({ ...classified, status: 'missing' });
      continue;
    }

    if (classified.kind === 'archive') {
      const dest = path.join(stageRoot, 'archives', path.basename(classified.path, classified.ext) || 'archive');
      fs.mkdirSync(dest, { recursive: true });
      const extracted = extractArchive(classified.path, dest);
      const rel = path.relative(root, dest);
      include.push(rel);
      items.push({ ...classified, status: 'extracted', stage: dest, extract: extracted });
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

    // Single file
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
    schema: 'agentsam.ingest.materials.v1',
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
