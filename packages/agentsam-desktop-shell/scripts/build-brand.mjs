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
import { composePlatformAppIcons } from './compose-app-icon.mjs';

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
const VALID_IDENTITY_PROVIDERS = ['portable', 'inneranimalmedia', 'google', 'github', 'gcp', 'email', 'google_desktop_and_cloudflare'];

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
// Precedence:
//   1. manifest.app_icon (SVG mark + surface profiles → platform masters)
//   2. --icon-url / <APP_ID>_ICON_URL / BRAND_ICON_URL / icon_source_url (fallback raster)
//   3. manifest.icon_set/icon.png on disk
// Never use Cloudflare Images avatar/hero/public delivery variants as masters.
const srcTauriDir = path.join(ROOT, 'src-tauri');
const iconsDir = path.join(srcTauriDir, 'icons');
const targetIcon = path.join(iconsDir, 'icon.png');
const namespacedEnvKey = `${String(manifest.app_id || 'app')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')}_ICON_URL`;

async function fetchIconFromUrl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`icon URL HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 64) throw new Error('icon URL returned empty/too-small body');
  mkdirSync(iconsDir, { recursive: true });
  writeFileSync(dest, buf);
}

async function resolveIcon() {
  mkdirSync(iconsDir, { recursive: true });

  if (manifest.app_icon && (manifest.app_icon.mark || manifest.icon_mark_svg)) {
    try {
      const composed = await composePlatformAppIcons({
        manifest,
        shellRoot: ROOT,
        iconsDir,
        targetIcon,
      });
      if (composed.composed) {
        console.log(
          `[build-brand] app_icon composed from SVG mark → ${composed.masters.macos || targetIcon}`,
        );
        console.log(
          `[build-brand] icon previews: ${path.join(iconsDir, 'composed', 'preview')} (1024…32)`,
        );
        return { forceRegen: true, source: 'app_icon_compose', composed };
      }
      console.warn(
        `[build-brand] WARNING: app_icon compose skipped (${composed.reason}) — falling back.`,
      );
    } catch (error) {
      console.warn(
        `[build-brand] WARNING: app_icon compose failed (${error.message}) — falling back to raster.`,
      );
    }
  }

  const iconUrl = String(
    flags['icon-url'] ||
      process.env[namespacedEnvKey] ||
      process.env.BRAND_ICON_URL ||
      manifest.app_icon?.fallback_master ||
      manifest.icon_source_url ||
      '',
  ).trim();

  if (iconUrl) {
    try {
      await fetchIconFromUrl(iconUrl, targetIcon);
      console.log(`[build-brand] icon downloaded from ${iconUrl} (fallback raster)`);
      return { forceRegen: true, source: 'fallback_url' };
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
      return { forceRegen: true, source: 'icon_set' };
    }
    console.warn(
      `[build-brand] WARNING: icon_set "${manifest.icon_set}" has no icon.png at ${brandIconPath} -- keeping existing placeholder icon.`,
    );
  } else {
    console.warn(
      `[build-brand] WARNING: no icon source. Set app_icon, --icon-url, ${namespacedEnvKey}, BRAND_ICON_URL, or manifest.icon_source_url.`,
    );
  }
  return { forceRegen: false, source: 'none' };
}

const iconResolve = await resolveIcon();
const forceIconRegen = Boolean(iconResolve.forceRegen);
const trayIconPath = existsSync(path.join(iconsDir, 'tray-32.png'))
  ? 'icons/tray-32.png'
  : 'icons/32x32.png';

// Tauri macOS bundler needs icns + sized PNGs — a lone 1024 PNG → "No matching IconType".
const BUNDLE_ICONS = [
  'icons/32x32.png',
  'icons/128x128.png',
  'icons/128x128@2x.png',
  'icons/icon.icns',
  'icons/icon.ico',
];

function generateIconSet({ force = false } = {}) {
  if (!existsSync(targetIcon)) {
    console.warn('[build-brand] WARNING: no icons/icon.png — skipping icon set generation');
    return;
  }
  const icns = path.join(iconsDir, 'icon.icns');
  const needsRegen =
    force ||
    !existsSync(icns) ||
    !existsSync(path.join(iconsDir, '32x32.png')) ||
    !existsSync(path.join(iconsDir, 'icon.ico')) ||
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
  // Verify expected bundle icons exist.
  for (const rel of BUNDLE_ICONS) {
    const p = path.join(srcTauriDir, rel);
    if (!existsSync(p)) fail(`missing bundle icon after generation: ${rel}`);
  }
  console.log('[build-brand] icon set ready:', BUNDLE_ICONS.join(', '));
}

generateIconSet({ force: forceIconRegen });

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
const desktopSpa = manifest.feature_flags?.desktop_spa === true;
const launchUrl = offlineShell || desktopSpa
  ? 'index.html'
  : new URL(manifest.launch_path || '/', manifest.base_url).toString();
const rawPlatform = String(process.env.TAURI_ENV_PLATFORM || '').toLowerCase();
const targetFamily = String(
  process.env.AGENTSAM_TARGET_FAMILY
    || (rawPlatform === 'ios' || rawPlatform === 'android' ? 'mobile' : 'desktop'),
).toLowerCase();
if (!['desktop', 'mobile'].includes(targetFamily)) {
  fail('AGENTSAM_TARGET_FAMILY must be desktop or mobile, got: ' + targetFamily);
}

const agentsamdSidecar = targetFamily === 'desktop'
  && manifest.feature_flags?.agentsamd_sidecar === true;

const identityAuthority = String(
  process.env.AGENTSAM_IDENTITY_AUTHORITY || manifest.auth?.authority || 'service',
).toLowerCase();
const configuredServiceOrigin = String(
  process.env.AGENTSAM_IDENTITY_SERVICE_ORIGIN
    || (manifest.auth?.service_origin && manifest.auth.service_origin !== 'install-config'
      ? manifest.auth.service_origin
      : ''),
).trim().replace(/\/$/, '');

if (!['service', 'standalone'].includes(identityAuthority)) {
  fail('identity authority must be service or standalone, got: ' + identityAuthority);
}
if (identityAuthority === 'service' && configuredServiceOrigin) {
  try {
    const parsed = new URL(configuredServiceOrigin);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
  } catch {
    fail('AGENTSAM_IDENTITY_SERVICE_ORIGIN is not a valid HTTP(S) origin: ' + configuredServiceOrigin);
  }
}

const generatedDir = path.join(ROOT, 'src-tauri', 'generated');
mkdirSync(generatedDir, { recursive: true });
const identityRuntimeConfig = {
  schema: 'agentsam.identity-runtime.v1',
  authority: identityAuthority,
  service_origin: configuredServiceOrigin || null,
  native_session: manifest.auth?.native_session || 'bearer',
  local_state: manifest.local_state || { adapter: 'sqlite', authority: 'device' },
  target_family: targetFamily,
};
writeFileSync(
  path.join(generatedDir, 'identity-runtime.json'),
  JSON.stringify(identityRuntimeConfig, null, 2) + '\n',
);

if (agentsamdSidecar) {
  const prep = spawnSync(process.execPath, [path.join(__dirname, 'prepare-sidecars.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (prep.status !== 0) fail(`agentsamd sidecar build failed (exit ${prep.status})`);
}

const config = {
  $schema: 'https://schema.tauri.app/config/2',
  productName: manifest.app_name,
  version: manifest.version || '0.1.0',
  identifier: manifest.bundle_identifier,
  build: {
    frontendDist: '../dist',
  },
  app: {
    withGlobalTauri: true,
    windows: [
      {
        label: 'main',
        title: manifest.app_name,
        width: 1200,
        height: 800,
        url: launchUrl,
      },
    ],
    trayIcon: targetFamily === 'desktop' && manifest.feature_flags?.tray !== false ? { iconPath: trayIconPath } : undefined,
  },
  bundle: {
    active: true,
    icon: BUNDLE_ICONS,
    ...(agentsamdSidecar ? { externalBin: ['binaries/agentsamd', 'binaries/node'] } : {}),
    ...(desktopSpa
      ? {
          resources: {
            'generated/identity-runtime.json': 'runtime/identity/runtime.json',
            '../../../apps/local-studio/agentsam.app.json': 'runtime/identity/app.json',
            ...(targetFamily === 'desktop'
              ? {
                  '../../agentsam-database-editor/scripts/local-sqlite-bridge.mjs':
                    'runtime/database/scripts/local-sqlite-bridge.mjs',
                  '../../agentsam-database-editor/src/adapters/sqlite.js':
                    'runtime/database/src/adapters/sqlite.js',
                  '../../../migrations/runtime': 'runtime/migrations',
                  '../../identity/scripts/local-identity-bridge.mjs':
                    'runtime/identity/scripts/local-identity-bridge.mjs',
                  '../../identity/src': 'runtime/identity/src',
                  '../../identity/migrations/sqlite': 'runtime/identity/migrations/sqlite',
                }
              : {}),
          },
        }
      : {}),
  },
  plugins: {
    'deep-link': {
      desktop: {
        schemes: [manifest.deep_link_scheme],
      },
    },
    ...(targetFamily === 'desktop' && pubkey && manifest.feature_flags?.auto_update !== false
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
console.log('[build-brand] target family: ' + targetFamily + '; identity authority: ' + identityAuthority + (configuredServiceOrigin ? ' @ ' + configuredServiceOrigin : ''));
console.log(`[build-brand] window url: ${launchUrl}${desktopSpa ? ' (desktop_spa)' : offlineShell ? ' (recovery_shell)' : ''}`);
console.log(
  `[build-brand] done. Next: cd src-tauri && cargo check   (or: npm run build, once a real dist/ exists)`,
);
