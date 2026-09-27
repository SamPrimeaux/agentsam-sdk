/**
 * agentsam brand optimize — role-aware optimization without exposing encoders.
 *
 * Flow: inspect → classify path → plan formats → schedule processor → receipt
 */

import fs from 'node:fs';
import path from 'node:path';
import { inspectBrandAsset } from './inspect.js';
import { getAssetRole } from './v2/roles.js';
import { planSemanticDerivatives } from './v2/derivatives-semantic.js';
import {
  discoverProcessors,
  optimizeWithScheduler,
  encodeWithScheduler,
  resolveProcessor,
} from './processors/index.js';
import {
  applySemanticNaming,
  buildDerivativeFilename,
  buildSemanticSlug,
} from './naming.js';
import { assert } from './errors.js';

/**
 * Role → encode policy (not a global "quality 80").
 */
export function optimizePolicyForRole(role, meta = {}) {
  const def = getAssetRole(role) || {};
  const family = def.family || 'raster';
  const alpha = Boolean(meta.alpha);

  if (family === 'logo' || role?.startsWith('logo.') || role === 'favicon') {
    return {
      keep_master: true,
      formats: alpha ? ['png', 'webp'] : ['webp', 'png'],
      lossless_preferred: true,
      quality: null,
      cqLevel: null,
      materialize_widths: [],
      note: 'logo/vector-preserving path — prefer SVG master when available',
    };
  }

  if (family === 'hero' || role?.startsWith('hero.') || role?.startsWith('social.')) {
    return {
      keep_master: true,
      formats: ['avif', 'webp'],
      lossless_preferred: false,
      quality: 82,
      cqLevel: 28,
      materialize_widths: [1280, 1920],
      note: 'photographic / hero delivery — AVIF + WebP; master retained for CF',
    };
  }

  if (role?.includes('screenshot') || role?.startsWith('product.')) {
    return {
      keep_master: true,
      formats: ['webp', 'avif'],
      lossless_preferred: true,
      quality: 90,
      cqLevel: 24,
      materialize_widths: [960, 1600],
      note: 'UI/screenshot — sharper WebP/AVIF',
    };
  }

  if (family === 'icon' || role?.startsWith('icon.')) {
    return {
      keep_master: true,
      formats: ['png', 'webp'],
      lossless_preferred: true,
      quality: null,
      cqLevel: null,
      materialize_widths: [512, 1024],
      note: 'app icon ladder — lossless-ish',
    };
  }

  return {
    keep_master: true,
    formats: alpha ? ['webp', 'png'] : ['avif', 'webp'],
    lossless_preferred: alpha,
    quality: 80,
    cqLevel: 30,
    materialize_widths: [],
    note: 'generic raster policy',
  };
}

/**
 * Optimize a source file into role-aware delivery candidates.
 */
export async function optimizeBrandAsset({
  sourcePath,
  role = 'asset.generic',
  target = 'web',
  brandId = '',
  outDir,
  processor,
  dryRun = false,
  semantic = {},
  widths,
} = {}) {
  assert(sourcePath && fs.existsSync(sourcePath), 'source_missing', `Source missing: ${sourcePath}`);

  const meta = inspectBrandAsset(sourcePath, { role });
  const policy = optimizePolicyForRole(role, meta);
  const discovery = discoverProcessors();

  const slug = buildSemanticSlug({
    brandId,
    role,
    subject: semantic.subject,
    page: semantic.page,
    section: semantic.section,
    locale: semantic.locale,
  });

  const assetDraft = applySemanticNaming(
    { id: `ast_${meta.sha256?.slice(7, 15) || Date.now().toString(36)}`, role, master: { path: sourcePath } },
    { brandId, ...semantic },
  );

  const plan = {
    role,
    target,
    policy,
    naming: assetDraft.naming,
    semantic: assetDraft.semantic,
    source: {
      path: sourcePath,
      bytes: meta.bytes,
      width: meta.width,
      height: meta.height,
      content_type: meta.content_type,
      alpha: meta.alpha,
      sha256: meta.sha256,
    },
    processors: discovery,
    candidates: [],
    artifacts: [],
  };

  if (target === 'cloudflare' || target === 'cf') {
    plan.delivery = {
      provider: 'cloudflare-images',
      strategy: 'retain_master_edge_derive',
      note: 'Upload high-quality master; let CF negotiate AVIF/WebP',
    };
    const edge = await resolveProcessor({ delivery: 'cloudflare-images', prefer_edge: true }, { force: 'cloudflare' });
    for (const format of policy.formats) {
      const edgePlan = await edge.encode(sourcePath, { format, quality: policy.quality });
      plan.candidates.push({
        format,
        ...edgePlan,
        filename: buildDerivativeFilename(slug, { format }),
      });
    }
    if (dryRun) return { ok: true, dry_run: true, ...plan };
    return { ok: true, ...plan, asset: assetDraft };
  }

  const destRoot = outDir || path.join(path.dirname(sourcePath), '.agentsam-optimize');
  if (!dryRun) fs.mkdirSync(destRoot, { recursive: true });

  const encodeWidths = widths || policy.materialize_widths || [];
  const formats = policy.formats;

  for (const format of formats) {
    const filename = buildDerivativeFilename(slug, { format });
    const outPath = path.join(destRoot, filename);
    const candidate = {
      format,
      filename,
      outPath,
      status: dryRun ? 'planned' : 'pending',
    };

    if (dryRun) {
      plan.candidates.push(candidate);
      continue;
    }

    try {
      const result = await encodeWithScheduler(sourcePath, {
        format,
        quality: policy.quality,
        cqLevel: policy.cqLevel,
        lossless: policy.lossless_preferred && (format === 'png' || format === 'webp'),
        auto: format === 'webp' || format === 'avif' ? undefined : undefined,
        outPath,
        processor,
        preserve_alpha: meta.alpha,
      });
      const savings = meta.bytes > 0
        ? Number((((meta.bytes - result.bytes) / meta.bytes) * 100).toFixed(1))
        : null;
      plan.candidates.push({
        ...candidate,
        status: 'generated',
        ...result,
        savings_pct: savings,
        receipt: {
          processor: result.processor,
          version: result.processor_version || null,
          encoder: format,
          options: result.options,
        },
      });
      plan.artifacts.push(result.path);
    } catch (err) {
      // Try optimize path as fallback once
      try {
        const result = await optimizeWithScheduler(sourcePath, {
          format,
          quality: policy.quality,
          outPath,
          processor,
        });
        plan.candidates.push({
          ...candidate,
          status: 'generated',
          ...result,
          savings_pct: meta.bytes > 0
            ? Number((((meta.bytes - result.bytes) / meta.bytes) * 100).toFixed(1))
            : null,
        });
        plan.artifacts.push(result.path);
      } catch (err2) {
        plan.candidates.push({
          ...candidate,
          status: 'failed',
          error: err2?.message || err?.message || String(err2 || err),
        });
      }
    }
  }

  // Optional width materialization (first format only — keep lean)
  const primaryFormat = formats[0];
  for (const w of encodeWidths) {
    const filename = buildDerivativeFilename(slug, { width: w, format: primaryFormat });
    const outPath = path.join(destRoot, filename);
    if (dryRun) {
      plan.candidates.push({ format: primaryFormat, width: w, filename, status: 'planned' });
      continue;
    }
    try {
      const proc = await resolveProcessor({ format: primaryFormat }, { force: processor });
      const resized = path.join(destRoot, `.tmp-${w}.png`);
      if (typeof proc.resize === 'function') {
        await proc.resize(sourcePath, { width: w, outPath: resized });
        const encoded = await encodeWithScheduler(resized, {
          format: primaryFormat,
          quality: policy.quality,
          cqLevel: policy.cqLevel,
          outPath,
          processor,
        });
        try {
          fs.unlinkSync(resized);
        } catch {
          /* ignore */
        }
        plan.candidates.push({
          format: primaryFormat,
          width: w,
          filename,
          status: 'generated',
          ...encoded,
        });
        plan.artifacts.push(encoded.path);
      }
    } catch (err) {
      plan.candidates.push({
        format: primaryFormat,
        width: w,
        filename,
        status: 'failed',
        error: err?.message || String(err),
      });
    }
  }

  // Comparison summary for Studio slider
  const best = plan.candidates
    .filter((c) => c.status === 'generated' && c.bytes != null)
    .sort((a, b) => a.bytes - b.bytes)[0] || null;

  plan.comparison = best
    ? {
        original: { bytes: meta.bytes, format: meta.content_type, width: meta.width, height: meta.height },
        optimized: {
          bytes: best.bytes,
          format: best.format,
          width: best.width,
          height: best.height,
          processor: best.processor,
          savings_pct: best.savings_pct,
        },
      }
    : null;

  // Attach semantic derivative planner for pack consumers
  plan.semantic_derivatives = planSemanticDerivatives(role, { materialize: 'pack' });

  return {
    ok: plan.candidates.some((c) => c.status === 'generated' || c.status === 'planned'),
    dry_run: dryRun,
    out_dir: destRoot,
    asset: assetDraft,
    ...plan,
  };
}
