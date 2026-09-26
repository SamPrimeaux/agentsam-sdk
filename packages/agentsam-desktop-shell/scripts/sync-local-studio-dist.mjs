#!/usr/bin/env node
/**
 * Copy a Local Studio production build into packages/agentsam-desktop-shell/dist
 * so the installed .app loads the real Work/Chat UI (not the thin boot HTML).
 *
 * Usage (from repo root or this package):
 *   node packages/agentsam-desktop-shell/scripts/sync-local-studio-dist.mjs
 *   node packages/agentsam-desktop-shell/scripts/sync-local-studio-dist.mjs --source apps/local-studio/dist
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SHELL_ROOT, '../..');
const DEST = path.join(SHELL_ROOT, 'dist');

const argSource = process.argv.find((a) => a.startsWith('--source='))?.slice('--source='.length);
const sourceIdx = process.argv.indexOf('--source');
const sourceFromFlag = sourceIdx >= 0 ? process.argv[sourceIdx + 1] : null;

const candidates = [
  argSource,
  sourceFromFlag,
  path.join(REPO_ROOT, 'apps/local-studio/dist'),
  path.join(REPO_ROOT, 'apps/local-studio/frontend/dist'),
  path.join(REPO_ROOT, 'apps/local-studio/.output/public'),
].filter(Boolean);

const source = candidates.find((p) => existsSync(path.join(p, 'index.html')));

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

const meta = {
  schema: 'agentsam.desktop.dist.v1',
  product: 'local-studio',
  source,
  synced_at: new Date().toISOString(),
  note: 'Installed Local Studio.app loads this bundle (offline_shell). Cloud Worker is optional sync/auth.',
};
writeFileSync(path.join(DEST, 'agentsam-desktop-dist.json'), JSON.stringify(meta, null, 2) + '\n');

const indexPath = path.join(DEST, 'index.html');
if (!existsSync(indexPath)) {
  console.error('[sync-local-studio-dist] copy finished but index.html missing');
  process.exit(1);
}

console.log(`[sync-local-studio-dist] ${source} → ${DEST}`);
console.log(`[sync-local-studio-dist] index.html bytes=${readFileSync(indexPath).length}`);
