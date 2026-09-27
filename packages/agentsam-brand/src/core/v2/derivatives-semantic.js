/**
 * Semantic derivatives — DERIVABLE vs MATERIALIZED.
 * Shared responsive ladder is a menu; roles pick what to materialize.
 */

import { ROLE_CANVAS, getAssetRole } from './roles.js';

/** Shared base ladder for responsive web imagery (materialize subset per role) */
export const RESPONSIVE_WIDTH_LADDER = Object.freeze([
  320, 480, 640, 768, 960, 1280, 1600, 1920, 2560,
]);

/**
 * @typedef {'derivable'|'materialized'} DerivativeState
 */

/**
 * Build semantic derivative plan for a role (does not write files).
 */
export function planSemanticDerivatives(role, options = {}) {
  const meta = getAssetRole(role) || { family: 'generic', canonical_policy: 'inspect' };
  const family = meta.family;
  const materializeAll = options.materializeAll === true;
  const out = {
    role,
    family,
    canonical_policy: meta.canonical_policy,
    buckets: {
      master: [],
      raster_fallbacks: [],
      delivery: [],
      platform: [],
      poster: [],
      tokens: [],
    },
  };

  if (family === 'logo') {
    out.buckets.master.push(derivable('master.svg', { format: 'svg', semantic: 'master' }));
    out.buckets.raster_fallbacks.push(
      ...[256, 512, 1024].map((w) => maybeMaterialize(`raster-${w}.png`, {
        format: 'png', width: w, height: w, semantic: 'raster-fallback', materialize: true,
      })),
    );
    out.buckets.delivery.push(
      derivable('header', { semantic: 'delivery.header', note: 'on-demand / CF Images' }),
      derivable('header-retina', { semantic: 'delivery.header-retina' }),
      derivable('footer', { semantic: 'delivery.footer' }),
      derivable('nav-compact', { semantic: 'delivery.nav-compact' }),
    );
    out.buckets.platform.push(
      derivable('social', { semantic: 'platform.social' }),
      derivable('favicon', { semantic: 'platform.favicon' }),
      derivable('print', { semantic: 'platform.print' }),
    );
  } else if (family === 'favicon') {
    const sizes = [
      { name: 'favicon.svg', format: 'svg', materialize: true },
      { name: 'favicon-16.png', format: 'png', width: 16, height: 16, materialize: true },
      { name: 'favicon-32.png', format: 'png', width: 32, height: 32, materialize: true },
      { name: 'favicon-48.png', format: 'png', width: 48, height: 48, materialize: true },
      { name: 'apple-touch-icon.png', format: 'png', width: 180, height: 180, materialize: true },
      { name: 'pwa-192.png', format: 'png', width: 192, height: 192, materialize: true },
      { name: 'pwa-512.png', format: 'png', width: 512, height: 512, materialize: true },
      { name: 'pwa-maskable-192.png', format: 'png', width: 192, height: 192, semantic: 'maskable', materialize: true, safe_padding: 0.2 },
      { name: 'pwa-maskable-512.png', format: 'png', width: 512, height: 512, semantic: 'maskable', materialize: true, safe_padding: 0.2 },
      { name: 'favicon.ico', format: 'ico', materialize: false, note: 'platform tool when available' },
      { name: 'site.webmanifest', format: 'json', materialize: true },
    ];
    for (const s of sizes) {
      out.buckets.platform.push(maybeMaterialize(s.name, s));
    }
  } else if (family === 'app-icon') {
    const ladder = [1024, 512, 256, 128, 64, 32, 16];
    out.buckets.master.push(maybeMaterialize('artwork-1024.png', {
      format: 'png', width: 1024, height: 1024, semantic: 'master', materialize: true,
    }));
    for (const w of ladder) {
      out.buckets.platform.push(maybeMaterialize(`icon-${w}.png`, {
        format: 'png', width: w, height: w, semantic: 'preview-size', materialize: w >= 128 || materializeAll,
        warn_detail_loss: w <= 32,
      }));
    }
    out.buckets.platform.push(
      derivable('icon.icns', { format: 'icns', semantic: 'macos' }),
      derivable('icon.ico', { format: 'ico', semantic: 'windows' }),
    );
  } else if (family === 'hero' || family === 'social' || family === 'product-shot') {
    const canvas = ROLE_CANVAS[role] || { width: 1920, height: 1080 };
    out.buckets.master.push(maybeMaterialize('master', {
      format: 'png',
      width: canvas.width,
      height: canvas.height,
      semantic: 'master',
      materialize: true,
    }));
    const widths = pickResponsiveWidths(family, options.maxWidth || canvas.width);
    for (const w of widths) {
      out.buckets.raster_fallbacks.push(maybeMaterialize(`w${w}`, {
        format: 'webp',
        width: w,
        semantic: 'responsive',
        materialize: materializeAll || w === widths[Math.floor(widths.length / 2)],
        note: materializeAll ? null : 'often on-demand via Cloudflare Images',
      }));
    }
    out.buckets.delivery.push(
      derivable('avif', { format: 'avif', semantic: 'delivery', note: 'CF format negotiation preferred' }),
      derivable('webp', { format: 'webp', semantic: 'delivery' }),
      derivable('jpeg', { format: 'jpeg', semantic: 'delivery-fallback' }),
    );
  } else if (family === 'video') {
    out.buckets.master.push(derivable('master.mov', { format: 'mov', semantic: 'master', materialize: true }));
    out.buckets.delivery.push(
      maybeMaterialize('web-1080.mp4', { format: 'mp4', height: 1080, semantic: 'web', materialize: true }),
      maybeMaterialize('web-720.mp4', { format: 'mp4', height: 720, semantic: 'web', materialize: false }),
      maybeMaterialize('mobile.mp4', { format: 'mp4', height: 720, semantic: 'mobile', materialize: false }),
    );
    out.buckets.poster.push(
      maybeMaterialize('poster-1920.webp', { format: 'webp', width: 1920, semantic: 'poster', materialize: true }),
      maybeMaterialize('poster-mobile.webp', { format: 'webp', width: 1080, semantic: 'poster', materialize: false }),
    );
  } else if (family === 'model') {
    out.buckets.master.push(maybeMaterialize('master.glb', { format: 'glb', semantic: 'master', materialize: true }));
    out.buckets.platform.push(
      derivable('model.gltf', { format: 'gltf' }),
      derivable('model.usdz', { format: 'usdz', semantic: 'ar' }),
    );
    out.buckets.poster.push(
      maybeMaterialize('preview.webp', { format: 'webp', semantic: 'preview', materialize: true }),
      maybeMaterialize('poster.webp', { format: 'webp', semantic: 'poster', materialize: false }),
      derivable('turntable.mp4', { format: 'mp4', semantic: 'turntable' }),
    );
  } else if (family === 'font') {
    out.buckets.master.push(derivable('source', { semantic: 'licensed_source', licensing_required: true }));
    out.buckets.delivery.push(
      derivable('woff2', { format: 'woff2', note: 'only if licensing.redistributable' }),
    );
  } else if (family === 'tokens' || family === 'theme') {
    out.buckets.tokens.push(
      maybeMaterialize('tokens.json', { format: 'json', materialize: true }),
      maybeMaterialize('tokens.css', { format: 'css', materialize: true }),
      derivable('tokens.ts', { format: 'ts' }),
      derivable('tailwind.preset.ts', { format: 'ts' }),
    );
  }

  return out;
}

function derivable(id, extra = {}) {
  return { id, state: 'derivable', ...extra };
}

function maybeMaterialize(id, { materialize = false, ...extra } = {}) {
  return {
    id,
    state: materialize ? 'materialized' : 'derivable',
    ...extra,
  };
}

export function pickResponsiveWidths(family, maxWidth = 2560) {
  const max = Number(maxWidth) || 2560;
  let picks = RESPONSIVE_WIDTH_LADDER.filter((w) => w <= max);
  if (family === 'product-shot' || family === 'social') {
    picks = picks.filter((w) => [320, 640, 960, 1280, 1600].includes(w) || w === picks[picks.length - 1]);
  } else if (family === 'hero') {
    picks = picks.filter((w) => w >= 640);
  } else if (family === 'logo') {
    picks = [];
  }
  return picks;
}

/** Flatten plan into sharp-style derivative rows for MATERIALIZED items only */
export function materializedToSharpDerivatives(plan) {
  const rows = [];
  for (const bucket of Object.values(plan.buckets || {})) {
    for (const d of bucket) {
      if (d.state !== 'materialized') continue;
      if (!d.format || d.format === 'svg' || d.format === 'json' || d.format === 'css') continue;
      if (!d.width && !d.height) continue;
      rows.push({
        id: d.id,
        role: d.semantic || 'raster',
        format: d.format,
        width: d.width || d.height,
        height: d.height || d.width,
        quality: d.quality,
        safe_padding: d.safe_padding,
      });
    }
  }
  return rows;
}

/** Default logo usage.json */
export function defaultLogoUsage(role = 'logo.primary') {
  return {
    role,
    minimumWidth: { digital: 96, printMm: 24 },
    clearspace: { basis: 'markHeight', multiplier: 0.25 },
    allowedBackgrounds: ['light', 'dark', 'brand'],
    forbidden: ['stretch', 'rotate', 'recolor-unapproved', 'add-shadow'],
  };
}
