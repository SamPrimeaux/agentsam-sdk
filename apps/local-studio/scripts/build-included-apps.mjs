#!/usr/bin/env node
/**
 * Build optional sibling apps declared on the desktop brand manifest
 * (`included_apps`). Empty/omitted = host Local Studio only.
 *
 * Usage (from apps/local-studio):
 *   node scripts/build-included-apps.mjs
 *   node scripts/build-included-apps.mjs --stage
 *   node scripts/build-included-apps.mjs --manifest ../../packages/agentsam-desktop-shell/manifests/local-studio.json
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_STUDIO = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(LOCAL_STUDIO, '../..');

const BUILDERS = {
  'cad-creator': {
    script: path.join(__dirname, 'build-cad-frontend.mjs'),
  },
};

const { values: flags } = parseArgs({
  args: process.argv.slice(2),
  options: {
    stage: { type: 'boolean', default: false },
    manifest: { type: 'string' },
  },
  allowPositionals: false,
  strict: false,
});

const defaultManifest = path.join(
  REPO_ROOT,
  'packages/agentsam-desktop-shell/manifests/local-studio.json',
);
const manifestPath = path.resolve(flags.manifest || defaultManifest);

if (!existsSync(manifestPath)) {
  console.log(`[included-apps] no desktop manifest at ${manifestPath} — skipping`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const included = Array.isArray(manifest.included_apps) ? manifest.included_apps : [];

if (included.length === 0) {
  console.log('[included-apps] none declared — host Local Studio only (no CAD/other app builds)');
  process.exit(0);
}

for (const appId of included) {
  const entry = BUILDERS[appId];
  if (!entry) {
    console.error(`[included-apps] ERROR: unknown app id "${appId}" (no builder mapped)`);
    process.exit(1);
  }
  if (!existsSync(entry.script)) {
    console.error(`[included-apps] ERROR: builder missing for ${appId}: ${entry.script}`);
    process.exit(1);
  }
  const args = [entry.script];
  if (flags.stage) args.push('--stage');
  console.log(`[included-apps] building ${appId}${flags.stage ? ' (--stage)' : ''}…`);
  const r = spawnSync(process.execPath, args, { cwd: LOCAL_STUDIO, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

console.log(`[included-apps] done: ${included.join(', ')}`);
