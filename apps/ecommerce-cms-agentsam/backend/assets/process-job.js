/**
 * Production asset job runner — shared by Worker queue consumer and apps/ecommerce-cms-agentsam/bin/assets.mjs.
 * Operator-facing lifecycle: processing → ready (never “optimize planned”).
 */

import { planAssetIngest } from "./worker-hook.js";
import { ASSET_DEFAULTS, assetStorage, publicUrlsForKey, deliveryUrlForKey, mediaPathForKey } from "./config.js";
import {
  getAssetJob,
  markJobProcessing,
  markJobSucceeded,
  markJobFailed,
  markJobSkipped,
} from "./jobs.js";

function parseJson(raw, fallback = {}) {
  if (!raw) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function loadMediaRow(env, mediaAssetId, intakeKey) {
  if (mediaAssetId) {
    const row = await env.DB.prepare(`SELECT * FROM media_assets WHERE id = ?`)
      .bind(mediaAssetId)
      .first();
    if (row) return row;
  }
  return env.DB.prepare(`SELECT * FROM media_assets WHERE r2_key = ?`).bind(intakeKey).first();
}

async function writeMediaMeta(env, mediaId, patch) {
  const row = await env.DB.prepare(`SELECT meta_json FROM media_assets WHERE id = ?`)
    .bind(mediaId)
    .first();
  const meta = { ...parseJson(row?.meta_json), ...patch };
  await env.DB.prepare(
    `UPDATE media_assets SET meta_json = ?, updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(JSON.stringify(meta), mediaId)
    .run();
  return meta;
}

/**
 * Finalize media_assets row onto the canonical object.
 */
export async function finalizeMediaAsset(env, mediaRow, result) {
  const canonicalKey = result.canonical_key;
  const urls = publicUrlsForKey(canonicalKey);
  const meta = {
    ...parseJson(mediaRow.meta_json),
    lifecycle: "ready",
    asset_role: result.asset_role || meta.asset_role,
    media_kind: result.media_kind || meta.media_kind,
    media_role: result.media_role || meta.media_role,
    pipeline: result.pipeline || meta.pipeline,
    intake_key: result.intake_key || mediaRow.r2_key,
    canonical_key: canonicalKey,
    retain_master_reason: result.retain_master_reason || null,
    optimization: {
      status: "ready",
      completed_at: new Date().toISOString(),
      output_format: result.content_type,
      source_bytes: result.source_bytes,
      output_bytes: result.output_bytes,
      savings_pct: result.savings_pct,
      width: result.width,
      height: result.height,
      encoder: result.encoder || null,
    },
    public_base_url: assetStorage().publicBaseUrl,
    worker_media_base_url: assetStorage().workerMediaBaseUrl,
  };

  await env.DB.prepare(
    `UPDATE media_assets
     SET r2_key = ?, url = ?, content_type = ?, size_bytes = ?, filename = ?, meta_json = ?, updated_at = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      canonicalKey,
      mediaPathForKey(canonicalKey),
      result.content_type,
      result.output_bytes,
      result.filename || canonicalKey.split("/").pop(),
      JSON.stringify(meta),
      mediaRow.id,
    )
    .run();

  return {
    ...meta,
    delivery_url: deliveryUrlForKey(canonicalKey),
    cdn_url: urls.cdn,
  };
}

/**
 * Process one job id end-to-end inside a Worker (wasm) or Node (sharp) runtime.
 *
 * @param {any} env  Worker env with DB + WEBSITE_ASSETS
 * @param {string} jobId
 * @param {{ runtime?: 'worker'|'node', cwd?: string }} [opts]
 */
export async function processAssetJobById(env, jobId, opts = {}) {
  const job = await getAssetJob(env, jobId);
  if (!job) throw new Error(`job_not_found:${jobId}`);
  if (job.status === "succeeded" || job.status === "skipped") {
    return { ok: true, already_done: true, status: job.status };
  }

  await markJobProcessing(env, jobId);
  const plan = parseJson(job.plan_json);
  const intakeKey = job.intake_key;
  const media = await loadMediaRow(env, job.media_asset_id, intakeKey);

  if (media) {
    await writeMediaMeta(env, media.id, { lifecycle: "processing" });
  }

  try {
    const classification = plan.classification || planAssetIngest({
      r2Key: intakeKey,
      contentType: media?.content_type,
      bytes: media?.size_bytes,
      filename: media?.filename,
      folder: media?.folder,
    }).classification;

    // Masters / unsupported: no transform — mark ready on intake key.
    if (
      classification.asset_role === "master" ||
      classification.asset_role === "unsupported" ||
      classification.transform_state === "no_transform" ||
      classification.pipeline === "no_transform" ||
      classification.pipeline === "glb" ||
      classification.pipeline === "video"
    ) {
      const result = {
        canonical_key: intakeKey,
        intake_key: intakeKey,
        content_type: media?.content_type || "application/octet-stream",
        output_bytes: media?.size_bytes || 0,
        source_bytes: media?.size_bytes || 0,
        savings_pct: 0,
        width: null,
        height: null,
        filename: media?.filename,
        asset_role: classification.asset_role,
        media_kind: classification.media_kind,
        media_role: classification.media_role,
        pipeline: classification.pipeline,
        retain_master_reason: classification.retain_master_reason,
        encoder: null,
        transformed: false,
      };
      if (media) await finalizeMediaAsset(env, media, result);
      const status =
        classification.asset_role === "unsupported" ? "skipped" : "succeeded";
      if (status === "skipped") {
        await markJobSkipped(env, jobId, "unsupported_or_no_transform", result);
      } else {
        await markJobSucceeded(env, jobId, result);
      }
      return { ok: true, status, result };
    }

    // Canonical image/icon path — transform then promote.
    const obj = await env.WEBSITE_ASSETS.get(intakeKey);
    if (!obj) throw new Error(`intake_missing:${intakeKey}`);
    const sourceBytes = await obj.arrayBuffer();
    const sourceSize = sourceBytes.byteLength;
    const sourceType = media?.content_type || obj.httpMetadata?.contentType || "image/jpeg";

    let transformed;
    if (opts.runtime === "node") {
      transformed = await transformWithSharp(intakeKey, sourceSize, opts);
    } else {
      const { optimizeRasterBuffer } = await import("./worker-image.js");
      const keepAlpha =
        classification.alpha_required ||
        classification.media_role === "logo" ||
        classification.media_role === "icon";
      const out = await optimizeRasterBuffer(sourceBytes, sourceType, {
        maxWidth: ASSET_DEFAULTS.defaults.maxWidth,
        quality: ASSET_DEFAULTS.defaults.quality,
        preferWebp: !keepAlpha || classification.media_role === "product_photo",
        keepAlpha,
      });
      const canonicalKey =
        plan.canonical_key ||
        intakeKey.replace(/\.[^.]+$/, "") + `.${out.ext}`;
      // Original objects are immutable. Even same-format output must not
      // overwrite intake bytes, and input cleanup requires separate reference GC.
      const destKey = canonicalKey === intakeKey
        ? intakeKey.replace(/(\.[^.]+)?$/, "-optimized-" + jobId + "." + out.ext)
        : canonicalKey;

      await env.WEBSITE_ASSETS.put(destKey, out.bytes, {
        httpMetadata: { contentType: out.contentType },
        customMetadata: {
          "agentsam-asset-role": "canonical",
          "agentsam-original-key": intakeKey.slice(0, 200),
          "agentsam-pipeline": classification.pipeline || "image",
        },
      });

      // Retain the source; no inline deletion in the conversion queue.
      // A separate reference-aware garbage collector can clean temporary intake
      // only after all media/revision/product relationships are reconciled.

      transformed = {
        canonical_key: destKey,
        intake_key: intakeKey,
        content_type: out.contentType,
        output_bytes: out.bytes.byteLength,
        source_bytes: sourceSize,
        savings_pct: sourceSize
          ? Math.round((1 - out.bytes.byteLength / sourceSize) * 1000) / 10
          : 0,
        width: out.width,
        height: out.height,
        filename: destKey.split("/").pop(),
        asset_role: "canonical",
        media_kind: classification.media_kind,
        media_role: classification.media_role,
        pipeline: classification.pipeline,
        encoder: "jsquash",
        transformed: true,
        intake_deleted: false,
        source_preserved: true,
      };
    }

    if (media) await finalizeMediaAsset(env, media, transformed);
    await markJobSucceeded(env, jobId, transformed);
    return { ok: true, status: "succeeded", result: transformed };
  } catch (err) {
    const message = err?.message || String(err);
    await markJobFailed(env, jobId, message);
    if (media) {
      await writeMediaMeta(env, media.id, {
        lifecycle: "failed",
        optimization: { status: "failed", error: message, at: new Date().toISOString() },
      });
    }
    throw err;
  }
}

/** Node-only Sharp path for CLI drain / batch. */
async function transformWithSharp(intakeKey, sourceSize, opts) {
  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { optimizeImageObject } = await import("./image-optimize.js");
  const workDir = join(tmpdir(), `fnf-job-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  const row = await optimizeImageObject(
    { key: intakeKey, size: sourceSize },
    {
      workDir,
      cwd: opts.cwd,
      deleteIntake: true,
      source: "asset_job_runner",
    },
  );
  if (!row.ok) throw new Error(row.error || "sharp_optimize_failed");
  return {
    canonical_key: row.canonical_key || intakeKey,
    intake_key: intakeKey,
    content_type: row.content_type || "image/webp",
    output_bytes: row.output_bytes || row.source_bytes,
    source_bytes: row.source_bytes,
    savings_pct: row.savings_pct || 0,
    width: row.width,
    height: row.height,
    filename: (row.canonical_key || intakeKey).split("/").pop(),
    asset_role: row.classification?.asset_role || "canonical",
    media_kind: row.classification?.media_kind,
    media_role: row.classification?.media_role,
    pipeline: row.classification?.pipeline,
    encoder: "sharp",
    transformed: !!row.optimized,
    intake_deleted: !!row.intake_deleted,
    retain_master_reason: row.retain_master_reason || null,
  };
}

/**
 * Drain jobs — CLI / admin may process any queued work.
 * Cron recovery should pass { staleOnly: true } so Queue remains primary.
 */
export async function drainAssetJobs(env, opts = {}) {
  const limit = opts.limit || 10;
  const { listQueuedJobs, listStaleAssetJobs } = await import("./jobs.js");
  const jobs = opts.staleOnly
    ? await listStaleAssetJobs(env, {
        limit,
        staleAfterSec: opts.staleAfterSec ?? 3600,
      })
    : await listQueuedJobs(env, limit);
  const results = [];
  for (const job of jobs) {
    try {
      const out = await processAssetJobById(env, job.id, opts);
      results.push({ id: job.id, ok: true, ...out });
    } catch (err) {
      results.push({ id: job.id, ok: false, error: err?.message || String(err) });
    }
  }
  return {
    processed: results.length,
    mode: opts.staleOnly ? "stale_recovery" : "drain",
    results,
  };
}
