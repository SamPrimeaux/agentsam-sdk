/**
 * Sharp-based image optimize with intake → promote → delete retention.
 * Ordinary ecommerce photos become one canonical optimized asset.
 * Masters (SVG, production PNG, etc.) are not destructively replaced.
 */
import { readFileSync, unlinkSync } from "node:fs";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { ASSET_STORAGE, publicUrlsForKey, deliveryUrlForKey } from "./config.js";
import { downloadObjectToFile, putObjectFromFile, deleteR2Object } from "./r2-client.js";
import { buildAssetTags, inferProductContextFromKey } from "./tags.js";
import { classifyMediaAsset, canonicalKeyForPromotion } from "./classify.js";

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

export function isImageKey(key) {
  return IMAGE_RE.test(String(key || ""));
}

function stemOf(key) {
  const base = basename(key);
  return base.replace(extname(base), "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
}

/**
 * @param {{ key: string, size?: number }} item
 * @param {{
 *   workDir: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 *   maxWidth?: number,
 *   quality?: number,
 *   productSlug?: string|null,
 *   collection?: string|null,
 *   source?: string,
 *   folder?: string|null,
 *   completeful?: object|null,
 *   deleteIntake?: boolean,
 * }} opts
 */
export async function optimizeImageObject(item, opts) {
  const key = item.key;
  const srcSize = Number(item.size || 0);
  const stem = stemOf(key);
  const inferred = inferProductContextFromKey(key);
  const productSlug = opts.productSlug ?? inferred.productSlug;
  const collection = opts.collection ?? inferred.collection;

  const srcPath = join(opts.workDir, `src-${stem}${extname(key) || ".bin"}`);
  await downloadObjectToFile(key, srcPath);

  const meta = await sharp(srcPath).metadata();
  const classification = classifyMediaAsset({
    r2Key: key,
    filename: basename(key),
    contentType: meta.format === "svg" ? "image/svg+xml" : `image/${meta.format || "jpeg"}`,
    bytes: srcSize || readFileSync(srcPath).length,
    width: meta.width,
    height: meta.height,
    hasAlpha: meta.hasAlpha,
    folder: opts.folder,
    completeful: opts.completeful,
  });

  if (classification.media_kind === "unsupported") {
    return {
      ok: false,
      transform_state: "unsupported",
      source_key: key,
      error: "unsupported_media",
      classification,
    };
  }

  // Masters / vectors: do not destructively web-optimize away the authority file.
  if (classification.asset_role === "master" || classification.transform_state === "no_transform") {
    const tags = buildAssetTags({
      r2Key: key,
      productSlug,
      collection,
      assetKind: classification.media_kind === "icon" ? "icon" : "image",
      source: opts.source || "fnf-assets-cli",
    });
    return {
      ok: true,
      transform_state: "no_transform",
      optimized: false,
      source_key: key,
      canonical_key: key,
      source_bytes: srcSize,
      width: meta.width || 0,
      height: meta.height || 0,
      classification,
      retain_master_reason: classification.retain_master_reason,
      urls: {
        canonical: publicUrlsForKey(key),
        delivery: deliveryUrlForKey(key),
      },
      tags,
      dry_run: !!opts.dryRun,
    };
  }

  const maxWidth = opts.maxWidth ?? ASSET_STORAGE.defaults.maxWidth;
  const quality = opts.quality ?? ASSET_STORAGE.defaults.quality;
  const wantAlpha = classification.alpha_required || meta.hasAlpha;
  const outExt = wantAlpha && classification.media_role === "logo" ? "png" : "webp";
  const outMime = outExt === "png" ? "image/png" : "image/webp";
  const optPath = join(opts.workDir, `${stem}-canonical.${outExt}`);

  let pipeline = sharp(srcPath).rotate().resize({ width: maxWidth, withoutEnlargement: true });
  if (outExt === "webp") {
    await pipeline.webp({ quality, alphaQuality: wantAlpha ? quality : undefined }).toFile(optPath);
  } else {
    await pipeline.png({ quality: Math.min(quality, 90), compressionLevel: 9 }).toFile(optPath);
  }

  const outBytes = readFileSync(optPath).length;
  const canonicalKey = canonicalKeyForPromotion({
    intakeKey: key,
    folder: opts.folder,
    mediaRole: classification.media_role,
    outputExt: outExt,
  });

  const tags = buildAssetTags({
    r2Key: key,
    productSlug,
    collection,
    assetKind: classification.media_kind === "icon" ? "icon" : productSlug ? "product" : "image",
    source: opts.source || "fnf-assets-cli",
  });

  const putOpts = { cwd: opts.cwd, dryRun: opts.dryRun };
  putObjectFromFile(
    canonicalKey,
    optPath,
    outMime,
    {
      ...tags.cf,
      "fnf-asset-role": "canonical",
      "fnf-variant": "canonical",
      "fnf-intake-key": key.slice(0, 200),
    },
    putOpts,
  );

  const deleteIntake =
    opts.deleteIntake !== false &&
    classification.promote_deletes_intake &&
    canonicalKey !== key &&
    !opts.dryRun;

  if (deleteIntake) {
    try {
      deleteR2Object(key, putOpts);
    } catch (e) {
      // Promote succeeded; intake cleanup failure is reported but not fatal.
      return {
        ok: true,
        transform_state: "promoted",
        optimized: true,
        warning: `intake_delete_failed: ${e?.message || e}`,
        source_key: key,
        intake_key: key,
        canonical_key: canonicalKey,
        source_bytes: srcSize,
        output_bytes: outBytes,
        width: meta.width || 0,
        height: meta.height || 0,
        savings_pct: srcSize ? Math.round((1 - outBytes / srcSize) * 1000) / 10 : 0,
        content_type: outMime,
        classification,
        urls: {
          canonical: publicUrlsForKey(canonicalKey),
          delivery: deliveryUrlForKey(canonicalKey),
        },
        tags,
        dry_run: !!opts.dryRun,
      };
    }
  }

  try {
    unlinkSync(optPath);
  } catch {
    /* tmp cleanup best-effort */
  }

  return {
    ok: true,
    transform_state: "promoted",
    optimized: true,
    source_key: key,
    intake_key: key,
    canonical_key: canonicalKey,
    intake_deleted: deleteIntake,
    source_bytes: srcSize,
    output_bytes: outBytes,
    width: meta.width || 0,
    height: meta.height || 0,
    savings_pct: srcSize ? Math.round((1 - outBytes / srcSize) * 1000) / 10 : 0,
    content_type: outMime,
    classification,
    urls: {
      canonical: publicUrlsForKey(canonicalKey),
      delivery: deliveryUrlForKey(canonicalKey),
    },
    tags,
    dry_run: !!opts.dryRun,
  };
}
