#!/usr/bin/env node
/**
 * Asset pipeline CLI (R2 optimize / promote / plan).
 * Storage comes from the project's own wrangler.toml (bucket binding, custom domain, account),
 * so nothing here is bucket- or product-specific. Run `assets help` from inside the project.
 */

import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  runImageOptimizePipeline,
  optimizeProductPrefixes,
  discoverChildPrefixes,
  listR2Objects,
  planProductAssetOptimization,
  planAssetIngest,
  optimizeImageObject,
  isImageKey,
  ASSET_DEFAULTS,
  configureAssetStorage,
} from "../backend/assets/index.js";
import { assetStorageFromProject, findProjectRoot } from "../backend/assets/project-config.js";

const ROOT = findProjectRoot();
const storage = configureAssetStorage(assetStorageFromProject(ROOT));
const [command = "help", ...rest] = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = rest.indexOf(name);
  if (i === -1) return fallback;
  return rest[i + 1] ?? fallback;
}
function has(name) {
  return rest.includes(name);
}

function help() {
  console.log(`assets — R2 asset pipeline

Bucket: ${storage.bucket}  binding: ${storage.binding}
CDN:    ${storage.publicBaseUrl}
Worker: ${storage.workerMediaBaseUrl}

Commands:
  prefixes      List the folders that actually exist under --under (default: bucket root)
  optimize      Batch optimize images under --prefix (admin/debug; production uses auto jobs)
  products      Optimize product folders under ${ASSET_DEFAULTS.productRoot} (discovered, or --prefixes a,b)
  promote       Promote a single intake key (admin/debug Sharp path)
  plan-product  Worker-safe plan for a product R2 key (no transform)
  plan          Worker-safe ingest plan for any media key
  jobs:process  Retry one job through the production Worker (needs FNF_ADMIN_SESSION_COOKIE)

Flags:
  --prefix <path>       R2 prefix (required for optimize; see "prefixes")
  --under <path>        Parent for "prefixes" (default: bucket root)
  --prefixes <a,b>      Explicit comma list for "products" (default: discover)
  --key <r2_key>        Single key for plan/promote/plan-product
  --job-id <id>         Job id for jobs:process
  --base <url>          Worker origin for jobs:process (default: origin of ${storage.workerMediaBaseUrl})
  --limit <n>           Cap queue size
  --min-bytes <n>       Skip smaller objects
  --max-width <n>       Default ${ASSET_DEFAULTS.defaults.maxWidth}
  --quality <n>         Default ${ASSET_DEFAULTS.defaults.quality}
  --dry-run             Transform locally only; no R2 puts / deletes

Production uploads auto-enqueue; this CLI is the same machinery for debug/batch.
Auth: run via ./scripts/with-cf-admin-env.sh node apps/ecommerce-cms-agentsam/bin/assets.mjs …
`);
}

async function main() {
  if (command === "help" || command === "-h" || command === "--help") {
    help();
    return;
  }

  if (command === "plan-product" || command === "plan") {
    const key = flag("--key");
    if (!key) throw new Error("--key required");
    const planner = command === "plan" ? planAssetIngest : planProductAssetOptimization;
    console.log(
      JSON.stringify(
        planner({
          r2Key: key,
          productSlug: flag("--product-slug"),
          collection: flag("--collection"),
          alt: flag("--alt"),
          folder: flag("--folder"),
        }),
        null,
        2,
      ),
    );
    return;
  }

  if (command === "jobs:drain" || command === "jobs:process") {
    // Secret-header /api/internal asset routes were removed.
    // Queue + scheduled stale recovery are production authority.
    // Operator retry: authenticated POST /api/admin/assets/jobs/:id/retry
    const cookie = process.env.FNF_ADMIN_SESSION_COOKIE || "";
    const base = flag("--base", new URL(storage.workerMediaBaseUrl).origin).replace(/\/$/, "");
    if (!cookie) {
      console.error(JSON.stringify({
        ok: false,
        error: "admin_session_required",
        message:
          "Asset jobs no longer use FNF_ASSET_JOB_SECRET. Set FNF_ADMIN_SESSION_COOKIE for operator retry, or rely on Queue/cron. Batch transforms: use optimize/promote.",
      }, null, 2));
      process.exit(1);
    }
    if (command === "jobs:process") {
      const jobId = flag("--job-id");
      if (!jobId) throw new Error("--job-id required");
      const res = await fetch(`${base}/api/admin/assets/jobs/${jobId}/retry`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
      });
      const body = await res.json().catch(() => ({}));
      console.log(JSON.stringify(body, null, 2));
      process.exit(res.ok ? 0 : 1);
    }
    console.error(JSON.stringify({
      ok: false,
      error: "use_queue_or_per_job_retry",
      message: "Bulk HTTP drain removed. Production Queue drains automatically; use jobs:process --job-id for one-off admin retry.",
    }, null, 2));
    process.exit(1);
  }

  if (command === "prefixes") {
    const under = flag("--under", "");
    const prefixes = await discoverChildPrefixes(under, listR2Objects);
    console.log(JSON.stringify({ ok: true, under, prefixes }, null, 2));
    return;
  }

  if (command === "promote") {
    const key = flag("--key");
    if (!key) throw new Error("--key required");
    if (!isImageKey(key)) {
      console.log(
        JSON.stringify(
          planAssetIngest({ r2Key: key, folder: flag("--folder") }),
          null,
          2,
        ),
      );
      return;
    }
    const workDir = join(tmpdir(), `fnf-promote-${Date.now()}`);
    mkdirSync(workDir, { recursive: true });
    const row = await optimizeImageObject(
      { key, size: Number(flag("--bytes", "0")) || 0 },
      {
        workDir,
        cwd: ROOT,
        dryRun: has("--dry-run"),
        maxWidth: Number(flag("--max-width", "0")) || undefined,
        quality: Number(flag("--quality", "0")) || undefined,
        productSlug: flag("--product-slug"),
        collection: flag("--collection"),
        folder: flag("--folder"),
        source: "assets promote",
        deleteIntake: !has("--keep-intake"),
      },
    );
    console.log(JSON.stringify(row, null, 2));
    process.exit(row.ok ? 0 : 1);
  }

  const common = {
    cwd: ROOT,
    dryRun: has("--dry-run"),
    limit: Number(flag("--limit", "0")) || 0,
    minBytes: Number(flag("--min-bytes", "0")) || 0,
    maxWidth: Number(flag("--max-width", "0")) || undefined,
    quality: Number(flag("--quality", "0")) || undefined,
  };

  if (command === "optimize") {
    const prefix = flag("--prefix");
    if (!prefix) throw new Error('--prefix <path> required. Run "prefixes" to see what exists.');
    const report = await runImageOptimizePipeline({
      ...common,
      prefix,
      source: "assets optimize",
    });
    console.log(
      JSON.stringify(
        {
          ok: report.counts.failed === 0,
          ...report.counts,
          savings_pct: report.totals.savings_pct,
          local_report: report.local_report,
          r2_report_key: report.r2_report_key,
        },
        null,
        2,
      ),
    );
    process.exit(report.counts.failed ? 1 : 0);
  }

  if (command === "products") {
    const raw = flag("--prefixes");
    const prefixes = raw
      ? raw.split(",").map((s) => s.trim()).filter(Boolean)
      : await discoverChildPrefixes(ASSET_DEFAULTS.productRoot, listR2Objects);
    if (!prefixes.length) throw new Error(`No product folders found under ${ASSET_DEFAULTS.productRoot}`);
    const reports = await optimizeProductPrefixes(prefixes, runImageOptimizePipeline, {
      ...common,
      source: "assets products",
    });
    const failed = reports.reduce((s, r) => s + (r.counts?.failed || 0), 0);
    const ok = reports.reduce((s, r) => s + (r.counts?.ok || 0), 0);
    console.log(JSON.stringify({ ok: failed === 0, prefixes, optimized: ok, failed }, null, 2));
    process.exit(failed ? 1 : 0);
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});
