#!/usr/bin/env node
/**
 * Verified artifact handoff for the existing multi-brand desktop shell.
 * Builds remain product-owned; this stage consumes a completed desktop SPA.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const shellRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultRepoRoot = path.resolve(shellRoot, '../..');
const receiptName = 'agentsam-desktop-dist.json';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const contains = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};
function portablePath(root, file) {
  return contains(root, file) ? path.relative(root, file).split(path.sep).join('/') : 'external-build-output';
}
function inventory(directory) {
  const files = [];
  function visit(current) {
    for (const name of readdirSync(current).sort()) {
      const file = path.join(current, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('Desktop artifact must not contain symlinks: ' + path.relative(directory, file));
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) {
        const relative = path.relative(directory, file).split(path.sep).join('/');
        if (relative === receiptName) continue;
        const bytes = readFileSync(file);
        files.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) });
      } else throw new Error('Unsupported desktop artifact entry: ' + file);
    }
  }
  visit(directory);
  return files;
}
function referencedAsset(source, reference) {
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean || /^[a-z][a-z0-9+.-]*:|^\/\//i.test(clean)) throw new Error('Desktop entry must reference bundled assets: ' + reference);
  const file = path.resolve(source, clean.replace(/^\//, ''));
  if (!contains(source, file) || !existsSync(file) || !lstatSync(file).isFile()) throw new Error('Missing or unsafe desktop entry asset: ' + reference);
  return file;
}
export function validateDesktopArtifact(source) {
  if (!existsSync(source) || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) throw new Error('Desktop build directory is missing or unsafe');
  const files = inventory(source);
  const entry = path.join(source, 'index.html');
  if (!existsSync(entry)) throw new Error('Desktop SPA index.html is missing');
  const html = readFileSync(entry, 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match => referencedAsset(source, match[1]));
  if (!scripts.length) throw new Error('Desktop SPA has no bundled JavaScript entry');
  for (const file of scripts) {
    const javascript = readFileSync(file, 'utf8');
    if (javascript.includes('hydrateRoot)(document') || /hydrateRoot\s*\(\s*document\s*,/.test(javascript)) throw new Error('Desktop SPA is hydrate-only; a client-rendered entry is required');
  }
  for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/\brel\s*=\s*["'](?:stylesheet|modulepreload)["']/i.test(tag[0])) continue;
    const reference = tag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (reference) referencedAsset(source, reference);
  }
  return { files, contentHash: digest(JSON.stringify(files)), entrypoints: scripts.map(file => path.relative(source, file).split(path.sep).join('/')) };
}
/** Accept an existing brand manifest, not another product registry or build recipe. */
export function stageDesktopArtifact({ source, destination, manifest, repoRoot = defaultRepoRoot, sdkVersion, now = new Date() }) {
  if (!source || !destination) throw new Error('Explicit source and destination are required');
  if (!manifest || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.app_id || '')) throw new Error('A valid desktop brand manifest app_id is required');
  source = path.resolve(source);
  destination = path.resolve(destination);
  repoRoot = realpathSync(path.resolve(repoRoot));
  if (contains(source, destination) || contains(destination, source) || destination === path.parse(destination).root || destination === repoRoot) throw new Error('Source and destination must be disjoint artifact directories');
  if (existsSync(destination) && (!lstatSync(destination).isDirectory() || lstatSync(destination).isSymbolicLink())) throw new Error('Desktop destination must be a regular directory');
  const original = validateDesktopArtifact(source);
  source = realpathSync(source);
  mkdirSync(path.dirname(destination), { recursive: true });
  const destinationParent = realpathSync(path.dirname(destination));
  const canonicalDestination = path.join(destinationParent, path.basename(destination));
  if (contains(source, canonicalDestination) || contains(canonicalDestination, source) || canonicalDestination === realpathSync(repoRoot)) throw new Error('Resolved desktop source and destination overlap');
  const transaction = mkdtempSync(path.join(destinationParent, '.desktop-stage-'));
  const staged = path.join(transaction, 'next');
  const previous = path.join(transaction, 'previous');
  let movedPrevious = false;
  let installed = false;
  try {
    cpSync(source, staged, { recursive: true, dereference: false });
    const copied = validateDesktopArtifact(staged);
    if (original.contentHash !== copied.contentHash) throw new Error('Desktop build changed while staging; rebuild and retry');
    const metadata = {
      schema: 'agentsam.desktop.dist.v1',
      product: manifest.app_id,
      source: portablePath(repoRoot, source),
      sdk_version: sdkVersion || manifest.version || '0.0.0',
      synced_at: now.toISOString(),
      client_mode: 'desktop_spa',
      artifact: { schema: 'agentsam.desktop.artifact.v1', content_sha256: copied.contentHash, entrypoints: copied.entrypoints, files: copied.files },
    };
    writeFileSync(path.join(staged, receiptName), JSON.stringify(metadata, null, 2) + '\n');
    if (existsSync(destination)) { renameSync(destination, previous); movedPrevious = true; }
    try { renameSync(staged, destination); installed = true; }
    catch (error) { if (movedPrevious) { renameSync(previous, destination); movedPrevious = false; } throw error; }
    return metadata;
  } finally {
    // Temporary replacement state only; never retain a second product build.
    // If a filesystem failure also prevents rollback, retain the prior directory
    // in the transaction for recovery instead of deleting the last good build.
    if (installed || !movedPrevious) rmSync(transaction, { recursive: true, force: true });
  }
}
export function stageDesktopFromArgs(args, { defaultManifest, defaultSource } = {}) {
  const option = (name) => {
    const equal = args.find(arg => arg.startsWith(name + '='));
    if (equal) return equal.slice(name.length + 1);
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(name + ' requires a value');
    return args[index + 1];
  };
  const manifestPath = path.resolve(option('--manifest') || defaultManifest || '');
  if (!option('--manifest') && !defaultManifest) throw new Error('--manifest is required');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const source = option('--source') || (!option('--manifest') ? defaultSource : undefined);
  if (!source) throw new Error('--source is required; build the selected product desktop SPA first');
  const pkg = path.join(defaultRepoRoot, 'package.json');
  const metadata = stageDesktopArtifact({
    source, destination: option('--destination') || path.join(shellRoot, 'dist'),
    manifest, repoRoot: defaultRepoRoot,
    sdkVersion: existsSync(pkg) ? JSON.parse(readFileSync(pkg, 'utf8')).version : undefined,
  });
  console.log('[desktop-stage] ' + metadata.product + ' · ' + metadata.artifact.files.length + ' verified files · sha256 ' + metadata.artifact.content_sha256);
  return metadata;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { stageDesktopFromArgs(process.argv.slice(2)); }
  catch (error) { console.error('[desktop-stage] ' + error.message); process.exitCode = 1; }
}
