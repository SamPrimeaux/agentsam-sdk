#!/usr/bin/env node
// Reads one manifests/<brand>.json, validates it against manifests/schema.json
// (manual checks -- no JSON-schema library dependency), and writes the
// resolved src-tauri/tauri.conf.json for that brand. This is the ONLY
// thing that should ever write tauri.conf.json -- nobody hand-edits it.
//
// Usage:
//   node scripts/build-brand.mjs <brand-name-or-path-to-manifest.json>
//
// Example:
//   node scripts/build-brand.mjs meauxbility
//   node scripts/build-brand.mjs ./manifests/meauxbility.json

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

// --- 1. resolve manifest path ---
const arg = process.argv[2];
if (!arg) fail('usage: node scripts/build-brand.mjs <brand-name-or-path>');

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
// Falls back to the placeholder icon (loud, not silent) if the brand
// hasn't supplied its own icon set yet.
const srcTauriDir = path.join(ROOT, 'src-tauri');
const iconsDir = path.join(srcTauriDir, 'icons');
const targetIcon = path.join(iconsDir, 'icon.png');
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
  console.warn('[build-brand] WARNING: no icon_set in manifest -- keeping placeholder icon.');
}

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
const launchUrl = new URL(manifest.launch_path || '/', manifest.base_url).toString();

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
    icon: ['icons/icon.png'],
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
console.log(
  `[build-brand] done. Next: cd src-tauri && cargo check   (or: npm run build, once a real dist/ exists)`,
);
