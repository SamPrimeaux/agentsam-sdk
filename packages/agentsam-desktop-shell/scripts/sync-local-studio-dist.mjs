#!/usr/bin/env node
/**
 * Copy Local Studio production assets into packages/agentsam-desktop-shell/dist
 * for the offline .app.
 *
 * The normal path is the dedicated Local Studio desktop SPA. The old boot page
 * is retained only as a catastrophic recovery surface when no desktop build is
 * available.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SHELL_ROOT, '../..');
const DEST = path.join(SHELL_ROOT, 'dist');
const BOOT_TEMPLATE = path.join(__dirname, 'desktop-boot.html');

const argSource = process.argv.find((a) => a.startsWith('--source='))?.slice('--source='.length);
const sourceIdx = process.argv.indexOf('--source');
const sourceFromFlag = sourceIdx >= 0 ? process.argv[sourceIdx + 1] : null;

function looksLikeStudioPublic(dir) {
  if (!dir || !existsSync(dir)) return false;
  if (existsSync(path.join(dir, 'index.html'))) return true;
  return existsSync(path.join(dir, 'assets')) && existsSync(path.join(dir, 'auth'));
}

function clientIsSsrHydrateOnly(jsPath) {
  try {
    const sample = readFileSync(jsPath, 'utf8');
    // Start client ends with hydrateRoot(document, …) — cannot mount into #root.
    return sample.includes('hydrateRoot)(document') || /hydrateRoot\s*\(\s*document\s*,/.test(sample);
  } catch {
    return false;
  }
}

const candidates = [
  argSource,
  sourceFromFlag,
  path.join(REPO_ROOT, 'apps/local-studio/desktop-dist'),
  path.join(REPO_ROOT, 'apps/local-studio/.output/public'),
  path.join(REPO_ROOT, 'apps/local-studio/dist'),
  path.join(REPO_ROOT, 'apps/local-studio/frontend/dist'),
].filter(Boolean);

const source = candidates.find((p) => looksLikeStudioPublic(p));

if (!source) {
  console.error('[sync-local-studio-dist] No Local Studio build found.');
  console.error('  Run from agentsam-sdk:');
  console.error('    cd apps/local-studio && npm run build');
  console.error('  Then re-run this script. Looked in:');
  for (const p of candidates) console.error(`    - ${p}`);
  process.exit(1);
}

if (!existsSync(BOOT_TEMPLATE)) {
  console.error(`[sync-local-studio-dist] missing boot template: ${BOOT_TEMPLATE}`);
  process.exit(1);
}

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(source, DEST, { recursive: true });

function pickAsset(prefix, ext) {
  const assetsDir = path.join(DEST, 'assets');
  if (!existsSync(assetsDir)) return null;
  const files = readdirSync(assetsDir).filter((f) => f.startsWith(prefix) && f.endsWith(ext));
  files.sort((a, b) => b.length - a.length);
  return files[0] ? path.join(assetsDir, files[0]) : null;
}

const indexJs = pickAsset('index-', '.js');
const isHydrateOnly = indexJs ? clientIsSsrHydrateOnly(indexJs) : false;
const sourceHasDesktopEntry = existsSync(path.join(source, 'index.html')) && !isHydrateOnly;

if (!sourceHasDesktopEntry) {
  writeFileSync(path.join(DEST, 'index.html'), readFileSync(BOOT_TEMPLATE));
  console.warn('[sync-local-studio-dist] desktop SPA missing; wrote recovery surface as index.html');
} else {
  console.log('[sync-local-studio-dist] bundled Local Studio desktop SPA is the normal index.html');
}

const pkgPath = path.join(REPO_ROOT, 'package.json');
const sdkVersion = existsSync(pkgPath)
  ? JSON.parse(readFileSync(pkgPath, 'utf8')).version
  : '0.0.0';

const meta = {
  schema: 'agentsam.desktop.dist.v1',
  product: 'local-studio',
  source,
  sdk_version: sdkVersion,
  synced_at: new Date().toISOString(),
  client_mode: sourceHasDesktopEntry ? 'desktop_spa' : 'recovery_surface',
  note: sourceHasDesktopEntry
    ? 'Bundled Local Studio is the first frame and works without a hosted redirect.'
    : 'Recovery surface only: rebuild apps/local-studio desktop bundle.',
};
writeFileSync(path.join(DEST, 'agentsam-desktop-dist.json'), `${JSON.stringify(meta, null, 2)}\n`);

console.log(`[sync-local-studio-dist] ${source} → ${DEST}`);
console.log(`[sync-local-studio-dist] index.html bytes=${readFileSync(path.join(DEST, 'index.html')).length}`);
