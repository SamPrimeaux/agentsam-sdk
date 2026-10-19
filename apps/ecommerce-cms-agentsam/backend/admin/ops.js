/**
 * Authenticated admin ops — asset job retry + AgentSam compaction.
 * No secret-header /api/internal endpoints.
 */

import { enqueueAssetJob, getAssetJob } from "../assets/jobs.js";
import { processAssetJobById } from "../assets/product-optimize.js";
import { runAgentsamCompaction } from "../agentsam/compaction.js";

function json(data, init = {}) {
  return Response.json(data, init);
}

/**
 * POST /api/admin/assets/jobs/:id/retry
 * Re-enqueue (preferred) or optionally run inline with ?inline=1
 */
export async function retryAssetJob(request, env, jobId, url) {
  const job = await getAssetJob(env, jobId);
  if (!job) return json({ ok: false, error: "job_not_found" }, { status: 404 });

  const inline = url.searchParams.get("inline") === "1";
  if (inline) {
    const result = await processAssetJobById(env, jobId, { runtime: "worker" });
    return json({ ok: true, mode: "inline", ...result });
  }

  const enq = await enqueueAssetJob(env, jobId, { media_asset_id: job.media_asset_id, retry: true });
  if (!enq.queued) {
    // No queue binding — process inline as last resort for operator action.
    const result = await processAssetJobById(env, jobId, { runtime: "worker" });
    return json({ ok: true, mode: "inline_fallback", ...result });
  }
  return json({ ok: true, mode: "enqueued", job_id: jobId, transport: enq.transport });
}

/**
 * POST /api/admin/agentsam/maintenance/compact
 * Capability: authenticated admin session (same as other admin APIs).
 */
export async function runAdminCompaction(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const result = await runAgentsamCompaction(env, {
    date_key: body.date_key,
    force: body.force === true,
    skip_trim: body.skip_trim === true,
    trigger_source: "admin",
  });
  return json({ ok: true, ...result });
}
