#!/usr/bin/env node
/**
 * Platform app-icon compositor (manifest-driven).
 *
 * mark SVG + brand surface + platform profile → platform masters + preview ladder
 * → consumed by build-brand → tauri icon.
 *
 * Surfaces / optical scales come from the brand manifest — no product hardcoding.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL_ROOT = path.resolve(__dirname, '..');
const PREVIEW_SIZES = [1024, 512, 256, 128, 64, 32];

function resolveSharp() {
  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(SHELL_ROOT, 'node_modules', 'sharp'),
    path.join(SHELL_ROOT, '..', 'agentsam-brand', 'node_modules', 'sharp'),
    path.join(SHELL_ROOT, '..', '..', 'node_modules', 'sharp'),
  ];
  for (const dir of candidates) {
    try {
      return require(dir);
    } catch {
      /* try next */
    }
  }
  try {
    return require('sharp');
  } catch (error) {
    throw new Error(
      `sharp is required for app-icon composition (${error.message}). Install in agentsam-desktop-shell or agentsam-brand.`,
    );
  }
}

function fail(message) {
  console.error(`[compose-app-icon] ERROR: ${message}`);
  process.exit(1);
}

function resolveMarkSvg(manifest, root) {
  const appIcon = manifest.app_icon || {};
  const rel =
    String(appIcon.mark || manifest.icon_mark_svg || '').trim() ||
    (manifest.icon_set ? path.join(manifest.icon_set, 'AgentSam-Mark.svg') : '');
  if (!rel) return null;
  const abs = path.resolve(root, rel);
  return existsSync(abs) ? abs : null;
}

function resolveSurface(manifest, surfaceId) {
  const surfaces = manifest.app_icon?.surfaces || {};
  const s = surfaces[surfaceId];
  if (!s || typeof s !== 'object') {
    fail(`unknown app_icon surface "${surfaceId}" — declare it under app_icon.surfaces`);
  }
  return {
    base: String(s.base || '#12141a'),
    raised: String(s.raised || s.base || '#1a1d26'),
    mark_fill: String(s.mark_fill || '#e8eaef'),
  };
}

function tintMarkSvg(svgText, fill) {
  // Force a solid fill so tray/mark_only stays readable on dark/light chrome.
  let out = String(svgText);
  if (/fill="currentColor"/i.test(out)) {
    out = out.replace(/fill="currentColor"/gi, `fill="${fill}"`);
  } else if (!/\sfill=/i.test(out)) {
    out = out.replace(/<svg\b/i, `<svg fill="${fill}"`);
  }
  return out;
}

async function renderMarkBuffer(sharp, svgPath, pixelSize, fill) {
  const raw = readFileSync(svgPath, 'utf8');
  const tinted = tintMarkSvg(raw, fill);
  const buf = Buffer.from(tinted);
  return sharp(buf, { density: 384 })
    .resize(pixelSize, pixelSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

async function composeSurfaceMaster(sharp, {
  size,
  surface,
  markPath,
  opticalScale,
}) {
  const scale = Math.min(0.92, Math.max(0.5, Number(opticalScale) || 0.74));
  const markPx = Math.round(size * scale);
  const markBuf = await renderMarkBuffer(sharp, markPath, markPx, surface.mark_fill);
  const base = hexToRgb(surface.base);
  const raised = hexToRgb(surface.raised);

  // Soft radial lift — premium graphite without baking an OS mask.
  const svgBg = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="g" cx="38%" cy="32%" r="72%">
      <stop offset="0%" stop-color="rgb(${raised.r},${raised.g},${raised.b})"/>
      <stop offset="100%" stop-color="rgb(${base.r},${base.g},${base.b})"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
</svg>`);

  const left = Math.round((size - markPx) / 2);
  const top = Math.round((size - markPx) / 2);
  return sharp(svgBg)
    .composite([{ input: markBuf, left, top }])
    .png()
    .toBuffer();
}

async function composeTrayMaster(sharp, { size, markPath, markFill }) {
  const markBuf = await renderMarkBuffer(sharp, markPath, size, markFill);
  // Transparent canvas — do not shrink a squircle app icon to tray size.
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: markBuf, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function writePreviewLadder(sharp, masterBuf, previewDir, prefix) {
  mkdirSync(previewDir, { recursive: true });
  const written = [];
  for (const dim of PREVIEW_SIZES) {
    const out = path.join(previewDir, `${prefix}-${dim}.png`);
    await sharp(masterBuf)
      .resize(dim, dim, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    written.push(out);
  }
  return written;
}

async function writeContactSheet(sharp, previewDir, prefix) {
  const tiles = [];
  for (const dim of PREVIEW_SIZES) {
    const p = path.join(previewDir, `${prefix}-${dim}.png`);
    if (!existsSync(p)) continue;
    const tile = await sharp(p)
      .resize(128, 128, { fit: 'contain', background: { r: 18, g: 20, b: 26, alpha: 1 } })
      .png()
      .toBuffer();
    tiles.push(tile);
  }
  if (!tiles.length) return null;
  const gap = 12;
  const cell = 128;
  const width = tiles.length * cell + (tiles.length + 1) * gap;
  const height = cell + gap * 2;
  const composites = tiles.map((input, i) => ({
    input,
    left: gap + i * (cell + gap),
    top: gap,
  }));
  const sheet = path.join(previewDir, `${prefix}-contact.png`);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 12, g: 14, b: 20, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(sheet);
  return sheet;
}

/**
 * @param {{
 *   manifest: object,
 *   shellRoot?: string,
 *   iconsDir: string,
 *   targetIcon: string,
 *   fetchFallback?: (url: string, dest: string) => Promise<void>,
 * }} opts
 */
export async function composePlatformAppIcons(opts) {
  const sharp = resolveSharp();
  const root = opts.shellRoot || SHELL_ROOT;
  const manifest = opts.manifest;
  const appIcon = manifest.app_icon || null;
  const markPath = resolveMarkSvg(manifest, root);
  const iconsDir = opts.iconsDir;
  const targetIcon = opts.targetIcon;
  const outDir = path.join(iconsDir, 'composed');
  const previewDir = path.join(outDir, 'preview');
  mkdirSync(outDir, { recursive: true });

  if (!appIcon || !markPath) {
    return {
      composed: false,
      reason: !markPath ? 'mark_svg_missing' : 'app_icon_contract_missing',
      markPath,
    };
  }

  const profiles = appIcon.profiles || {};
  const defaultSurfaceId =
    profiles.macos?.surface ||
    profiles.ios?.surface ||
    Object.keys(appIcon.surfaces || {})[0];
  if (!defaultSurfaceId) fail('app_icon.profiles must reference a surface');

  const result = {
    composed: true,
    markPath,
    masters: {},
    previews: [],
    contactSheets: [],
    source: 'svg_mark+surface',
  };

  // --- macOS (primary Tauri / Dock master) ---
  const macos = profiles.macos || { surface: defaultSurfaceId, optical_scale: 0.74 };
  const macosSurface = resolveSurface(manifest, macos.surface || defaultSurfaceId);
  const macosSize = Number(macos.size || 1024) || 1024;
  const macosBuf = await composeSurfaceMaster(sharp, {
    size: macosSize,
    surface: macosSurface,
    markPath,
    opticalScale: macos.optical_scale ?? 0.74,
  });
  const macosMaster = path.join(outDir, 'macos-1024.png');
  writeFileSync(macosMaster, macosBuf);
  result.masters.macos = macosMaster;
  copyFileSync(macosMaster, targetIcon);
  result.previews.push(
    ...(await writePreviewLadder(sharp, macosBuf, previewDir, 'macos')),
  );
  const macosSheet = await writeContactSheet(sharp, previewDir, 'macos');
  if (macosSheet) result.contactSheets.push(macosSheet);

  // --- iOS (full-bleed square; no baked mask) ---
  if (profiles.ios) {
    const ios = profiles.ios;
    const iosSurface = resolveSurface(manifest, ios.surface || defaultSurfaceId);
    const iosBuf = await composeSurfaceMaster(sharp, {
      size: Number(ios.size || 1024) || 1024,
      surface: iosSurface,
      markPath,
      opticalScale: ios.optical_scale ?? 0.78,
    });
    const iosMaster = path.join(outDir, 'ios-1024.png');
    writeFileSync(iosMaster, iosBuf);
    result.masters.ios = iosMaster;
    result.previews.push(...(await writePreviewLadder(sharp, iosBuf, previewDir, 'ios')));
    const iosSheet = await writeContactSheet(sharp, previewDir, 'ios');
    if (iosSheet) result.contactSheets.push(iosSheet);
    if (ios.system_mask) {
      writeFileSync(
        path.join(outDir, 'ios-NOTE.txt'),
        'iOS master is full-bleed square artwork. Do not bake Apple rounded masks; system_mask=true.\n',
      );
    }
  }

  // --- Windows ---
  if (profiles.windows) {
    const win = profiles.windows;
    const winSurface = resolveSurface(manifest, win.surface || defaultSurfaceId);
    const winBuf = await composeSurfaceMaster(sharp, {
      size: Number(win.size || 1024) || 1024,
      surface: winSurface,
      markPath,
      opticalScale: win.optical_scale ?? 0.76,
    });
    const winMaster = path.join(outDir, 'windows-1024.png');
    writeFileSync(winMaster, winBuf);
    result.masters.windows = winMaster;
    result.previews.push(...(await writePreviewLadder(sharp, winBuf, previewDir, 'windows')));
  }

  // --- Android (adaptive-icon source master; no baked launcher mask) ---
  if (profiles.android) {
    const android = profiles.android;
    const androidSurface = resolveSurface(manifest, android.surface || defaultSurfaceId);
    const androidBuf = await composeSurfaceMaster(sharp, {
      size: Number(android.size || 1024) || 1024,
      surface: androidSurface,
      markPath,
      opticalScale: android.optical_scale ?? 0.78,
    });
    const androidMaster = path.join(outDir, 'android-1024.png');
    writeFileSync(androidMaster, androidBuf);
    result.masters.android = androidMaster;
    result.previews.push(...(await writePreviewLadder(sharp, androidBuf, previewDir, 'android')));
    if (android.adaptive_icon) {
      writeFileSync(
        path.join(outDir, 'android-NOTE.txt'),
        'Android master is adaptive-icon source artwork. Launcher masks belong to the Android build system.\n',
      );
    }
  }

  // --- Linux desktop ---
  if (profiles.linux) {
    const linux = profiles.linux;
    const linuxSurface = resolveSurface(manifest, linux.surface || defaultSurfaceId);
    const linuxBuf = await composeSurfaceMaster(sharp, {
      size: Number(linux.size || 1024) || 1024,
      surface: linuxSurface,
      markPath,
      opticalScale: linux.optical_scale ?? 0.76,
    });
    const linuxMaster = path.join(outDir, 'linux-1024.png');
    writeFileSync(linuxMaster, linuxBuf);
    result.masters.linux = linuxMaster;
    result.previews.push(...(await writePreviewLadder(sharp, linuxBuf, previewDir, 'linux')));
  }

  // --- Tray (mark-only; never shrink full app icon) ---
  if (profiles.tray) {
    const tray = profiles.tray;
    const traySize = Number(tray.size || 128) || 128;
    const fill =
      tray.mark_fill ||
      resolveSurface(manifest, tray.surface || defaultSurfaceId).mark_fill;
    const trayBuf = await composeTrayMaster(sharp, {
      size: traySize,
      markPath,
      markFill: fill,
    });
    const trayMaster = path.join(outDir, `tray-${traySize}.png`);
    writeFileSync(trayMaster, trayBuf);
    result.masters.tray = trayMaster;
    // Dedicated tray 32 for tauri trayIcon — mark-only, not Dock master shrunk.
    const tray32 = path.join(iconsDir, 'tray-32.png');
    await sharp(trayBuf)
      .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(tray32);
    result.masters.tray32 = tray32;
    result.previews.push(...(await writePreviewLadder(sharp, trayBuf, previewDir, 'tray')));
  }

  // Stable 1024 master for tauri icon regen
  const master1024 = path.join(iconsDir, 'icon-1024-master.png');
  copyFileSync(macosMaster, master1024);
  result.masters.tauri_input = master1024;

  writeFileSync(
    path.join(outDir, 'receipt.json'),
    `${JSON.stringify(
      {
        schema: 'agentsam.desktop.app_icon.receipt.v1',
        mark: path.relative(root, markPath),
        profiles: Object.keys(profiles),
        masters: Object.fromEntries(
          Object.entries(result.masters).map(([k, v]) => [k, path.relative(root, v)]),
        ),
        optical_scales: {
          macos: macos.optical_scale ?? 0.74,
          ios: profiles.ios?.optical_scale ?? null,
          windows: profiles.windows?.optical_scale ?? null,
        },
        note: 'Preview ladder under composed/preview — judge optical size before shipping.',
      },
      null,
      2,
    )}\n`,
  );

  return result;
}

// CLI: node scripts/compose-app-icon.mjs <manifest.json>
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifestArg = process.argv[2];
  if (!manifestArg) fail('usage: compose-app-icon.mjs <manifest.json>');
  const manifestPath = path.resolve(process.cwd(), manifestArg);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const iconsDir = path.join(SHELL_ROOT, 'src-tauri', 'icons');
  mkdirSync(iconsDir, { recursive: true });
  const targetIcon = path.join(iconsDir, 'icon.png');
  composePlatformAppIcons({
    manifest,
    shellRoot: SHELL_ROOT,
    iconsDir,
    targetIcon,
  })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((err) => fail(err.message || String(err)));
}
