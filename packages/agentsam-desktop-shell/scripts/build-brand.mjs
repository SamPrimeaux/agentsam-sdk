#!/usr/bin/env node
// Reads one manifests/<brand>.json and writes src-tauri/tauri.conf.json.
// Usage:
//   node scripts/build-brand.mjs <brand> [--icon-url <url>]
//   build-brand <brand> --icon-url https://asr…/icon.png

import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function fail(message) {
  console.error(`[build-brand] ERROR: ${message}`);
  process.exit(1);
}

function loadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(`could not read/parse ${filePath}: ${err.message}`);
  }
}

const { values: flags, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'icon-url': { type: 'string' },
  },
  allowPositionals: true,
  strict: false,
});

const arg = positionals[0];
if (!arg) fail('usage: build-brand <brand-name-or-path> [--icon-url <url>]');

const manifestPath =
  arg.endsWith('.json') || arg.includes('/')
    ? path.resolve(process.cwd(), arg)
    : path.join(ROOT, 'manifests', `${arg}.json`);

if (!existsSync(manifestPath)) fail(`manifest not found: ${manifestPath}`);
const manifest = loadJson(manifestPath);

// --- 2. minimal schema validation (mirrors manifests/schema.json) ---
const REQUIRED = [
  'app_id',
  'app_name',
  'bundle_identifier',
  'base_url',
  'deep_link_scheme',
  'identity_provider',
];
const VALID_IDENTITY_PROVIDERS = ['inneranimalmedia', 'google', 'github', 'gcp', 'email'];

for (const field of REQUIRED) {
  if (!manifest[field]) fail(`manifest missing required field: ${field}`);
}
if (!/^[a-z0-9-]+$/.test(manifest.app_id)) {
  fail(`app_id must match ^[a-z0-9-]+$, got: ${manifest.app_id}`);
}
if (!/^[a-z0-9.-]+$/.test(manifest.bundle_identifier)) {
  fail(`bundle_identifier must match ^[a-z0-9.-]+$, got: ${manifest.bundle_identifier}`);
}
if (!/^[a-z][a-z0-9]*$/.test(manifest.deep_link_scheme)) {
  fail(`deep_link_scheme must match ^[a-z][a-z0-9]*$, got: ${manifest.deep_link_scheme}`);
}
if (!VALID_IDENTITY_PROVIDERS.includes(manifest.identity_provider)) {
  fail(
    `identity_provider must be one of ${VALID_IDENTITY_PROVIDERS.join(', ')}, got: ${manifest.identity_provider}`,
  );
}
try {
  new URL(manifest.base_url);
} catch {
  fail(`base_url is not a valid URL: ${manifest.base_url}`);
}

const VALID_SURFACES = ['workspace', 'app', 'store', 'portal', 'brand'];
if (manifest.surface && !VALID_SURFACES.includes(manifest.surface)) {
  fail(`surface must be one of ${VALID_SURFACES.join(', ')}, got: ${manifest.surface}`);
}
if (manifest.launch_path && (!manifest.launch_path.startsWith('/') || manifest.launch_path.includes(' '))) {
  fail(`launch_path must start with '/' and contain no spaces, got: ${manifest.launch_path}`);
}
if (manifest.allowed_web_origins) {
  if (!Array.isArray(manifest.allowed_web_origins)) {
    fail(`allowed_web_origins must be an array, got: ${typeof manifest.allowed_web_origins}`);
  }
  for (const origin of manifest.allowed_web_origins) {
    try {
      new URL(origin);
    } catch {
      fail(`allowed_web_origin is not a valid URL: ${origin}`);
    }
  }
}

console.log(`[build-brand] manifest OK: ${manifest.app_id} (${manifest.app_name})`);

// --- 3. load the update signing public key ---
// This is the ONLY thing read from the private/public keypair -- the
// .pub file's raw content is what tauri.conf.json's pubkey field wants,
// as-is, no further decoding. The private key is never touched here.
const pubkeyPath = path.join(ROOT, 'update-signing.key.pub');
let pubkey = null;
if (existsSync(pubkeyPath)) {
  pubkey = readFileSync(pubkeyPath, 'utf8').trim();
} else {
  console.warn(
    '[build-brand] WARNING: no update-signing.key.pub found -- updater plugin will be left unconfigured for this build.',
  );
}

// --- 4. resolve icon ---
// Precedence (no product-hardcoded env names):
//   1. --icon-url
//   2. <APP_ID>_ICON_URL (from manifest.app_id)
//   3. BRAND_ICON_URL
//   4. manifest.icon_source_url
//   5. manifest.icon_set/icon.png on disk
const srcTauriDir = path.join(ROOT, 'src-tauri');
const iconsDir = path.join(srcTauriDir, 'icons');
const targetIcon = path.join(iconsDir, 'icon.png');
const namespacedEnvKey = `${String(manifest.app_id || 'app')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')}_ICON_URL`;

async function resolveIcon() {
  async function fetchIconFromUrl(url, dest) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`icon URL HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) throw new Error('icon URL returned empty/too-small body');
    mkdirSync(iconsDir, { recursive: true });
    writeFileSync(dest, buf);
  }

  const iconUrl = String(
    flags['icon-url'] ||
      process.env[namespacedEnvKey] ||
      process.env.BRAND_ICON_URL ||
      manifest.icon_source_url ||
      '',
  ).trim();

  if (iconUrl) {
    try {
      await fetchIconFromUrl(iconUrl, targetIcon);
      console.log(`[build-brand] icon downloaded from ${iconUrl}`);
      return;
    } catch (error) {
      console.warn(
        `[build-brand] WARNING: icon URL failed (${error.message}) — falling back to icon_set/placeholder.`,
      );
    }
  }

  if (manifest.icon_set) {
    const brandIconPath = path.resolve(ROOT, manifest.icon_set, 'icon.png');
    if (existsSync(brandIconPath)) {
      copyFileSync(brandIconPath, targetIcon);
      console.log(`[build-brand] icon copied from ${brandIconPath}`);
    } else {
      console.warn(
        `[build-brand] WARNING: icon_set "${manifest.icon_set}" has no icon.png at ${brandIconPath} -- keeping existing placeholder icon.`,
      );
    }
  } else {
    console.warn(
      `[build-brand] WARNING: no icon source. Set --icon-url, ${namespacedEnvKey}, BRAND_ICON_URL, or manifest.icon_source_url.`,
    );
  }
}

await resolveIcon();

// Tauri macOS bundler needs icns + sized PNGs — a lone 1024 PNG → "No matching IconType".
const BUNDLE_ICONS = [
  'icons/32x32.png',
  'icons/128x128.png',
  'icons/128x128@2x.png',
  'icons/icon.icns',
  'icons/icon.ico',
];

function generateIconSet() {
  if (!existsSync(targetIcon)) {
    console.warn('[build-brand] WARNING: no icons/icon.png — skipping icon set generation');
    return;
  }
  const icns = path.join(iconsDir, 'icon.icns');
  const needsRegen =
    !existsSync(icns) ||
    !existsSync(path.join(iconsDir, '32x32.png')) ||
    statSync(targetIcon).mtimeMs > statSync(icns).mtimeMs;
  if (!needsRegen) {
    console.log('[build-brand] icon set up to date (icns/png/ico present)');
    return;
  }
  // Prefer a stable master so tauri icon doesn't overwrite the 1024 source mid-run.
  const master = path.join(iconsDir, 'icon-1024-master.png');
  if (!existsSync(master) || statSync(targetIcon).mtimeMs >= statSync(master).mtimeMs) {
    copyFileSync(targetIcon, master);
  }
  console.log('[build-brand] generating Tauri icon set from', master);
  const r = spawnSync(
    'npx',
    ['tauri', 'icon', master, '--output', iconsDir],
    { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
  );
  if (r.status !== 0) {
    fail(`tauri icon failed (exit ${r.status}) — macOS bundle needs icon.icns`);
  }
  // Restore tray/app PNG to a known good raster (tauri icon rewrites icon.png smaller).
  if (existsSync(master)) copyFileSync(master, targetIcon);
}

generateIconSet();

// --- 5. build the updater endpoint ---
// {{target}}/{{arch}}/{{current_version}} are Tauri's own runtime
// placeholders, substituted by the updater plugin itself. app_id is
// baked in statically here since tauri.conf.json is already per-brand.
//
// UPDATES_DOMAIN is a placeholder until the Worker (../worker) is
// actually deployed and given a real route -- update it here once that
// domain exists. Left as a named constant, not scattered inline, so
// there's exactly one place to change it.
const UPDATES_DOMAIN = 'https://updates.agentsam.dev';
const updaterEndpoint = `${UPDATES_DOMAIN}/updates/${manifest.app_id}/{{target}}/{{arch}}/{{current_version}}`;

// --- 6. assemble tauri.conf.json ---
const offlineShell = manifest.feature_flags?.offline_shell === true;
const launchUrl = offlineShell
  ? 'index.html'
  : new URL(manifest.launch_path || '/', manifest.base_url).toString();

const config = {
  $schema: 'https://schema.tauri.app/config/2',
  productName: manifest.app_name,
  version: manifest.version || '0.1.0',
  identifier: manifest.bundle_identifier,
  build: {
    frontendDist: '../dist',
  },
  app: {
    windows: [
      {
        label: 'main',
        title: manifest.app_name,
        width: 1200,
        height: 800,
        url: launchUrl,
      },
    ],
    trayIcon: manifest.feature_flags?.tray === false ? undefined : { iconPath: 'icons/icon.png' },
  },
  bundle: {
    active: true,
    icon: BUNDLE_ICONS,
  },
  plugins: {
    'deep-link': {
      desktop: {
        schemes: [manifest.deep_link_scheme],
      },
    },
    ...(pubkey && manifest.feature_flags?.auto_update !== false
      ? {
          updater: {
            pubkey,
            endpoints: [updaterEndpoint],
          },
        }
      : {}),
  },
};

const outPath = path.join(srcTauriDir, 'tauri.conf.json');
writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');
console.log(`[build-brand] wrote ${outPath}`);
console.log(`[build-brand] window url: ${launchUrl}${offlineShell ? ' (offline_shell)' : ''}`);
console.log(
  `[build-brand] done. Next: cd src-tauri && cargo check   (or: npm run build, once a real dist/ exists)`,
);
