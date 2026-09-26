#!/usr/bin/env node
/**
 * Copy Local Studio production assets into packages/agentsam-desktop-shell/dist
 * for the offline .app (never a hosted redirect).
 *
 * Nitro/cloudflare builds often omit root index.html (Worker SSR). When that
 * happens we synthesize a Tauri-ready shell that loads the hashed client bundle.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SHELL_ROOT, '../..');
const DEST = path.join(SHELL_ROOT, 'dist');

const argSource = process.argv.find((a) => a.startsWith('--source='))?.slice('--source='.length);
const sourceIdx = process.argv.indexOf('--source');
const sourceFromFlag = sourceIdx >= 0 ? process.argv[sourceIdx + 1] : null;

function looksLikeStudioPublic(dir) {
  if (!dir || !existsSync(dir)) return false;
  if (existsSync(path.join(dir, 'index.html'))) return true;
  // Nitro public dir: assets/ + auth/ without root index.html
  return existsSync(path.join(dir, 'assets')) && existsSync(path.join(dir, 'auth'));
}

const candidates = [
  argSource,
  sourceFromFlag,
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

rmSync(DEST, { recursive: true, force: true });
mkdirSync(DEST, { recursive: true });
cpSync(source, DEST, { recursive: true });

function pickAsset(prefix, ext) {
  const assetsDir = path.join(DEST, 'assets');
  if (!existsSync(assetsDir)) return null;
  const files = readdirSync(assetsDir).filter((f) => f.startsWith(prefix) && f.endsWith(ext));
  // Prefer longest/hashiest index-* over short names
  files.sort((a, b) => b.length - a.length);
  return files[0] ? `assets/${files[0]}` : null;
}

if (!existsSync(path.join(DEST, 'index.html'))) {
  const js = pickAsset('index-', '.js');
  const css = pickAsset('index-', '.css');
  if (!js) {
    console.error('[sync-local-studio-dist] No assets/index-*.js in build — cannot synthesize shell');
    process.exit(1);
  }
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AgentSam Local Studio</title>
    ${css ? `<link rel="stylesheet" crossorigin href="./${css}" />` : ''}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" crossorigin src="./${js}"></script>
  </body>
</html>
`;
  writeFileSync(path.join(DEST, 'index.html'), html);
  console.log(`[sync-local-studio-dist] synthesized index.html → ${js}${css ? ` + ${css}` : ''}`);
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
  note: 'Installed Local Studio.app loads this bundle (offline_shell). Never navigate to hosted /agentsam as home.',
};
writeFileSync(path.join(DEST, 'agentsam-desktop-dist.json'), `${JSON.stringify(meta, null, 2)}\n`);

console.log(`[sync-local-studio-dist] ${source} → ${DEST}`);
console.log(`[sync-local-studio-dist] index.html bytes=${readFileSync(path.join(DEST, 'index.html')).length}`);
