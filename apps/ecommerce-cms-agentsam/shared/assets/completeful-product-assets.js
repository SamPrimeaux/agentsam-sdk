/**
 * Completeful / in-app product asset hook.
 * When a product (or design mockup) lands in R2, call this to:
 *   1) optimize → staging
 *   2) attach SEO + CF tags
 *   3) return URLs + tag payload for D1 media_assets / product_images
 *
 * Worker-safe shape: pass env.WEBSITE_ASSETS when available; CLI path uses wrangler.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ASSET_STORAGE } from "./config.js";
import { optimizeImageObject, isImageKey } from "./image-optimize.js";
import { buildAssetTags } from "./tags.js";

/**
 * Autonomously optimize + tag a product image key after Completeful/in-app create.
 *
 * @param {{
 *   r2Key: string,
 *   sizeBytes?: number,
 *   productSlug?: string,
 *   collection?: string,
 *   alt?: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 * }} input
 */
export async function optimizeProductAsset(input) {
  const key = String(input.r2Key || "").replace(/^\/+/, "");
  if (!isImageKey(key)) {
    return {
      ok: false,
      skipped: true,
      reason: "not_an_image",
      source_key: key,
      tags: buildAssetTags({
        r2Key: key,
        productSlug: input.productSlug,
        collection: input.collection,
        assetKind: "product",
        alt: input.alt,
        source: "completeful_product",
      }),
    };
  }

  const workDir = join(tmpdir(), `fnf-product-asset-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  const stageOpt = `${ASSET_STORAGE.stage.products}/${input.productSlug || "general"}/optimized`;
  const stagePrev = `${ASSET_STORAGE.stage.products}/${input.productSlug || "general"}/preview`;

  return optimizeImageObject(
    { key, size: input.sizeBytes || 0 },
    {
      workDir,
      cwd: input.cwd,
      dryRun: input.dryRun,
      maxWidth: ASSET_STORAGE.defaults.productMaxWidth,
      quality: ASSET_STORAGE.defaults.productQuality,
      stageOptimized: stageOpt,
      stagePreview: stagePrev,
      productSlug: input.productSlug,
      collection: input.collection,
      source: "completeful_product",
    },
  );
}

/**
 * Batch helper for product folder prefixes (shirts, hats, …).
 * @param {string[]} prefixes
 * @param {import('./pipeline.js').runImageOptimizePipeline extends Function} runPipeline
 * @param {object} [opts]
 */
export async function optimizeProductPrefixes(prefixes, runPipeline, opts = {}) {
  const reports = [];
  for (const prefix of prefixes) {
    const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
    const report = await runPipeline({
      ...opts,
      prefix: normalized,
      maxWidth: opts.maxWidth ?? ASSET_STORAGE.defaults.productMaxWidth,
      quality: opts.quality ?? ASSET_STORAGE.defaults.productQuality,
      source: opts.source || "completeful_product_batch",
    });
    reports.push(report);
  }
  return reports;
}
