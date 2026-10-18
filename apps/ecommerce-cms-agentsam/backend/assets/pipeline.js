/**
 * Batch image optimize pipeline orchestrator.
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ASSET_DEFAULTS, assetStorage } from "./config.js";
import { listR2Objects, putObjectFromFile } from "./r2-client.js";
import { isImageKey, optimizeImageObject } from "./image-optimize.js";

function stageDirsForPrefix(prefix) {
  const p = String(prefix || "");
  if (p.startsWith("products/")) {
    const folder = p.replace(/^products\//, "").replace(/\/$/, "") || "general";
    const slug = folder.split("/")[0] || "general";
    return {
      stageOptimized: `${ASSET_DEFAULTS.stage.products}/${slug}/optimized`,
      stagePreview: `${ASSET_DEFAULTS.stage.products}/${slug}/preview`,
    };
  }
  return {
    stageOptimized: ASSET_DEFAULTS.stage.optimized,
    stagePreview: ASSET_DEFAULTS.stage.preview,
  };
}
/**
 * @param {{
 *   prefix: string,
 *   cwd?: string,
 *   dryRun?: boolean,
 *   limit?: number,
 *   minBytes?: number,
 *   maxWidth?: number,
 *   previewWidth?: number,
 *   quality?: number,
 *   skipStaging?: boolean,
 *   source?: string,
 *   reportDir?: string|null,
 *   onProgress?: (msg: string) => void,
 * }} options
 */
export async function runImageOptimizePipeline(options) {
  const prefix = options.prefix || "uploads/";
  const log = options.onProgress || ((m) => console.log(m));
  const cwd = options.cwd || process.cwd();

  let objects = await listR2Objects(prefix);
  objects = objects.filter(
    (o) => isImageKey(o.key) && !String(o.key).includes("/staging/"),
  );
  if (options.minBytes > 0) {
    objects = objects.filter((o) => o.size >= options.minBytes);
  }
  objects.sort((a, b) => b.size - a.size);
  if (options.limit > 0) objects = objects.slice(0, options.limit);

  const sourceBytes = objects.reduce((s, o) => s + o.size, 0);
  log(
    `queued ${objects.length} images under ${prefix} (${Math.round(sourceBytes / 1e6)} MB source)`,
  );

  const stages = stageDirsForPrefix(prefix);
  const workDir = join(tmpdir(), `fnf-assets-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });

  const results = [];
  let fail = 0;
  for (let i = 0; i < objects.length; i++) {
    const item = objects[i];
    log(`[${i + 1}/${objects.length}] ${item.key} (${Math.round(item.size / 1024)} KB)…`);
    try {
      const row = await optimizeImageObject(item, {
        workDir,
        cwd,
        dryRun: options.dryRun,
        maxWidth: options.maxWidth,
        previewWidth: options.previewWidth,
        quality: options.quality,
        stageOptimized: stages.stageOptimized,
        stagePreview: stages.stagePreview,
        source: options.source || "fnf_image_pipeline",
      });
      results.push(row);
      if (row.transform_state === "no_transform") {
        log(`  → master/no_transform retained (${row.retain_master_reason || "policy"})`);
      } else if (row.transform_state === "unsupported") {
        log(`  → unsupported (no pretend optimize)`);
      } else {
        const out = row.output_bytes || row.optimized_webp_bytes || 0;
        const save = row.savings_pct ?? row.savings_pct_vs_webp ?? 0;
        log(`  → ${row.canonical_key || "canonical"} ${Math.round(out / 1024)} KB (−${save}%) intake_deleted=${!!row.intake_deleted}`);
      }
    } catch (e) {
      fail += 1;
      results.push({ ok: false, source_key: item.key, error: e?.message || String(e) });
      log(`  FAIL ${e?.message || e}`);
    }
  }

  const okRows = results.filter((r) => r.ok);
  const srcTotal = okRows.reduce((s, r) => s + (r.source_bytes || 0), 0);
  const outTotal = okRows.reduce(
    (s, r) => s + (r.output_bytes || r.optimized_webp_bytes || r.source_bytes || 0),
    0,
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    workflow_key: "fnf_image_pipeline",
    bucket: assetStorage().bucket,
    binding: assetStorage().binding,
    prefix,
    generated_at: new Date().toISOString(),
    dry_run: !!options.dryRun,
    counts: { queued: objects.length, ok: okRows.length, failed: fail },
    totals: {
      source_bytes: srcTotal,
      output_bytes: outTotal,
      optimized_webp_bytes: outTotal,
      savings_pct: srcTotal ? Math.round((1 - outTotal / srcTotal) * 1000) / 10 : 0,
    },
    retention_policy: "intake_promote_delete",
    public: {
      custom_domain: assetStorage().publicBaseUrl,
      worker_media: assetStorage().workerMediaBaseUrl,
    },
    results,
  };

  const reportDir = options.reportDir ?? join(cwd, ".fnf-backups");
  if (reportDir) {
    if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
    const localPath = join(reportDir, `image-batch-${stamp}.json`);
    writeFileSync(localPath, JSON.stringify(report, null, 2));
    report.local_report = localPath;
    log(`local report: ${localPath}`);
  }

  if (!options.dryRun) {
    const reportKey = `${ASSET_DEFAULTS.stage.reports}/image-batch-${stamp}.json`;
    const reportFile = join(workDir, "report.json");
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    putObjectFromFile(reportKey, reportFile, "application/json", {
      "fnf-pipeline": "fnf_image_pipeline",
      "fnf-report": "1",
    }, { cwd });
    report.r2_report_key = reportKey;
    log(`r2 report: ${assetStorage().workerMediaBaseUrl}/${reportKey}`);
  }

  return report;
}
