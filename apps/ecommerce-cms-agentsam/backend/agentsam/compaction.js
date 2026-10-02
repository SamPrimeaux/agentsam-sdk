/**
 * AgentSam compaction — roll hot D1 logs into daily stats and trim retention windows.
 */

import { FNF_ACCOUNT_ID } from "./constants.js";
import { trackAgentSamEvent } from "./analytics.js";

export const RETENTION = {
  analyticsHotDays: 30,
  promptUsageHotDays: 30,
  toolLogHotDays: 14,
  webhookPayloadProcessedDays: 7,
  webhookPayloadIgnoredDays: 3,
  webhookPayloadFailedDays: 30,
  webhookProcessedDays: 30,
  webhookIgnoredDays: 14,
  webhookFailedDays: 90,
  hookExecutionSuccessDays: 30,
  hookExecutionFailureDays: 90,
  webhookCleanupBatch: 500,
  threadSummaryAfterDays: 30,
  summaryRefreshLimit: 40,
};

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export function dateKeyFromUnix(unixSec) {
  const d = new Date(unixSec * 1000);
  return d.toISOString().slice(0, 10);
}

export function yesterdayDateKey(now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function dayUnixRange(dateKey) {
  const start = Math.floor(new Date(`${dateKey}T00:00:00.000Z`).getTime() / 1000);
  const end = start + 86400;
  return { start, end };
}

async function hasCompactionForDate(env, dateKey) {
  const row = await env.DB.prepare(
    `SELECT id FROM agentsam_compaction_runs
     WHERE account_id = ? AND date_key = ? AND status = 'success'
     LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, dateKey)
    .first();
  return Boolean(row?.id);
}

async function startCompactionRun(env, dateKey, triggerSource) {
  const runId = id("acmp");
  const startedAt = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO agentsam_compaction_runs (
       id, account_id, date_key, trigger_source, status, started_at
     ) VALUES (?, ?, ?, ?, 'started', ?)`
  )
    .bind(runId, FNF_ACCOUNT_ID, dateKey, triggerSource, startedAt)
    .run();
  return { runId, startedAt };
}

async function finishCompactionRun(env, runId, patch) {
  const finishedAt = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agentsam_compaction_runs SET
       status = ?,
       finished_at = ?,
       duration_ms = ?,
       analytics_rows = ?,
       prompt_usage_rows = ?,
       tool_call_rows = ?,
       analytics_deleted = ?,
       prompt_usage_deleted = ?,
       tool_call_deleted = ?,
       summaries_refreshed = ?,
       error_message = ?,
       stats_json = ?
     WHERE id = ?`
  )
    .bind(
      patch.status || "success",
      finishedAt,
      patch.duration_ms ?? 0,
      patch.analytics_rows ?? 0,
      patch.prompt_usage_rows ?? 0,
      patch.tool_call_rows ?? 0,
      patch.analytics_deleted ?? 0,
      patch.prompt_usage_deleted ?? 0,
      patch.tool_call_deleted ?? 0,
      patch.summaries_refreshed ?? 0,
      patch.error_message ?? null,
      JSON.stringify(patch.stats || {}),
      runId
    )
    .run();
}

export async function rollupAnalyticsDaily(env, dateKey) {
  if (!env?.DB) return { ok: false, error: "DB not bound", rows: 0 };

  const result = await env.DB.prepare(
    `INSERT INTO agentsam_analytics_daily (
       id, account_id, date_key,
       event_type, event_name, workflow_key, task_type, model_id,
       provider, channel, campaign_id, product_id,
       event_count, success_count, failed_count, started_count, fallback_count,
       total_input_tokens, total_output_tokens, total_estimated_cost_usd,
       avg_duration_ms, avg_ai_latency_ms, compacted_at
     )
     SELECT
       'aad_' || lower(hex(randomblob(8))),
       ?,
       ?,
       COALESCE(NULLIF(event_type, ''), '_all'),
       COALESCE(NULLIF(event_name, ''), '_all'),
       COALESCE(NULLIF(workflow_key, ''), '_all'),
       COALESCE(NULLIF(task_type, ''), '_all'),
       COALESCE(NULLIF(model_id, ''), '_all'),
       COALESCE(NULLIF(provider, ''), '_all'),
       COALESCE(NULLIF(channel, ''), '_all'),
       COALESCE(NULLIF(campaign_id, ''), '_all'),
       COALESCE(NULLIF(product_id, ''), '_all'),
       COUNT(*),
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),
       SUM(CASE WHEN status = 'started' THEN 1 ELSE 0 END),
       SUM(CASE WHEN status = 'fallback' OR fallback_used = 1 THEN 1 ELSE 0 END),
       COALESCE(SUM(input_tokens), 0),
       COALESCE(SUM(output_tokens), 0),
       COALESCE(SUM(estimated_cost_usd), 0),
       COALESCE(AVG(duration_ms), 0),
       COALESCE(AVG(ai_latency_ms), 0),
       unixepoch()
     FROM agentsam_analytics
     WHERE account_id = ? AND date_key = ?
     GROUP BY event_type, event_name, workflow_key, task_type, model_id,
              provider, channel, campaign_id, product_id
     ON CONFLICT(
       account_id, date_key, event_type, event_name, workflow_key, task_type,
       model_id, provider, channel, campaign_id, product_id
     )
     DO UPDATE SET
       event_count = excluded.event_count,
       success_count = excluded.success_count,
       failed_count = excluded.failed_count,
       started_count = excluded.started_count,
       fallback_count = excluded.fallback_count,
       total_input_tokens = excluded.total_input_tokens,
       total_output_tokens = excluded.total_output_tokens,
       total_estimated_cost_usd = excluded.total_estimated_cost_usd,
       avg_duration_ms = excluded.avg_duration_ms,
       avg_ai_latency_ms = excluded.avg_ai_latency_ms,
       compacted_at = excluded.compacted_at`
  )
    .bind(FNF_ACCOUNT_ID, dateKey, FNF_ACCOUNT_ID, dateKey)
    .run();

  return { ok: true, rows: result.meta?.changes ?? 0 };
}

export async function rollupPromptUsageDaily(env, dateKey) {
  if (!env?.DB) return { ok: false, error: "DB not bound", rows: 0 };

  const result = await env.DB.prepare(
    `INSERT INTO agentsam_prompt_usage_daily (
       id, account_id, date_key,
       workflow_key, route_lane, task_type, model_id,
       request_count, prompt_cache_hits, context_cache_hits, both_cache_hits,
       total_saved_tokens, total_saved_cost_usd,
       total_input_tokens, total_output_tokens,
       avg_build_duration_ms, avg_cache_lookup_ms, failed_count, compacted_at
     )
     SELECT
       'apud_' || lower(hex(randomblob(8))),
       ?,
       ?,
       COALESCE(NULLIF(workflow_key, ''), '_all'),
       COALESCE(NULLIF(route_lane, ''), '_all'),
       COALESCE(NULLIF(task_type, ''), '_all'),
       COALESCE(NULLIF(model_id, ''), '_all'),
       COUNT(*),
       SUM(CASE WHEN prompt_cache_hit = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN context_cache_hit = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN prompt_cache_hit = 1 AND context_cache_hit = 1 THEN 1 ELSE 0 END),
       COALESCE(SUM(saved_tokens_estimated), 0),
       COALESCE(SUM(saved_cost_estimated_usd), 0),
       COALESCE(SUM(input_tokens), 0),
       COALESCE(SUM(output_tokens), 0),
       COALESCE(AVG(build_duration_ms), 0),
       COALESCE(AVG(cache_lookup_ms), 0),
       SUM(CASE WHEN status IN ('failed', 'ai_failed') THEN 1 ELSE 0 END),
       unixepoch()
     FROM agentsam_prompt_usage
     WHERE account_id = ? AND date_key = ?
     GROUP BY workflow_key, route_lane, task_type, model_id
     ON CONFLICT(account_id, date_key, workflow_key, route_lane, task_type, model_id)
     DO UPDATE SET
       request_count = excluded.request_count,
       prompt_cache_hits = excluded.prompt_cache_hits,
       context_cache_hits = excluded.context_cache_hits,
       both_cache_hits = excluded.both_cache_hits,
       total_saved_tokens = excluded.total_saved_tokens,
       total_saved_cost_usd = excluded.total_saved_cost_usd,
       total_input_tokens = excluded.total_input_tokens,
       total_output_tokens = excluded.total_output_tokens,
       avg_build_duration_ms = excluded.avg_build_duration_ms,
       avg_cache_lookup_ms = excluded.avg_cache_lookup_ms,
       failed_count = excluded.failed_count,
       compacted_at = excluded.compacted_at`
  )
    .bind(FNF_ACCOUNT_ID, dateKey, FNF_ACCOUNT_ID, dateKey)
    .run();

  return { ok: true, rows: result.meta?.changes ?? 0 };
}

export async function rollupToolCallDaily(env, dateKey) {
  if (!env?.DB) return { ok: false, error: "DB not bound", rows: 0 };

  const { start, end } = dayUnixRange(dateKey);

  const dailyResult = await env.DB.prepare(
    `INSERT INTO agentsam_tool_call_daily (
       id, account_id, date_key, tool_key, tool_name, tool_category, mcp_server_key,
       total_calls, success_count, failure_count, success_rate,
       total_cost_usd, total_tokens, avg_duration_ms, max_duration_ms, compacted_at
     )
     SELECT
       'atcd_' || lower(hex(randomblob(8))),
       ?,
       ?,
       COALESCE(NULLIF(tool_key, ''), tool_name, 'unknown'),
       MAX(tool_name),
       MAX(tool_category),
       MAX(mcp_server_key),
       COUNT(*),
       SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END),
       SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END),
       CASE WHEN COUNT(*) > 0
         THEN CAST(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS REAL) / COUNT(*)
         ELSE 0 END,
       COALESCE(SUM(cost_usd), 0),
       COALESCE(SUM(input_tokens + output_tokens), 0),
       COALESCE(AVG(duration_ms), 0),
       COALESCE(MAX(duration_ms), 0),
       unixepoch()
     FROM agentsam_tool_call_log
     WHERE account_id = ? AND created_at >= ? AND created_at < ?
     GROUP BY COALESCE(NULLIF(tool_key, ''), tool_name, 'unknown')
     ON CONFLICT(account_id, date_key, tool_key)
     DO UPDATE SET
       tool_name = excluded.tool_name,
       tool_category = excluded.tool_category,
       mcp_server_key = excluded.mcp_server_key,
       total_calls = excluded.total_calls,
       success_count = excluded.success_count,
       failure_count = excluded.failure_count,
       success_rate = excluded.success_rate,
       total_cost_usd = excluded.total_cost_usd,
       total_tokens = excluded.total_tokens,
       avg_duration_ms = excluded.avg_duration_ms,
       max_duration_ms = excluded.max_duration_ms,
       compacted_at = excluded.compacted_at`
  )
    .bind(FNF_ACCOUNT_ID, dateKey, FNF_ACCOUNT_ID, start, end)
    .run();

  const lifetimeResult = await env.DB.prepare(
    `INSERT INTO agentsam_tool_stats_compacted (
       id, account_id, tool_key, tool_name,
       total_calls, success_count, failure_count, success_rate,
       total_cost_usd, total_tokens, avg_duration_ms, p95_duration_ms,
       first_seen_at, last_seen_at, compacted_at
     )
     SELECT
       'atsc_' || lower(hex(randomblob(8))),
       ?,
       tool_key,
       tool_name,
       total_calls,
       success_count,
       failure_count,
       success_rate,
       total_cost_usd,
       total_tokens,
       avg_duration_ms,
       max_duration_ms,
       ?,
       ?,
       unixepoch()
     FROM agentsam_tool_call_daily
     WHERE account_id = ? AND date_key = ?
     ON CONFLICT(account_id, tool_key)
     DO UPDATE SET
       tool_name = excluded.tool_name,
       total_calls = agentsam_tool_stats_compacted.total_calls + excluded.total_calls,
       success_count = agentsam_tool_stats_compacted.success_count + excluded.success_count,
       failure_count = agentsam_tool_stats_compacted.failure_count + excluded.failure_count,
       success_rate = CASE
         WHEN (agentsam_tool_stats_compacted.total_calls + excluded.total_calls) > 0
         THEN CAST(agentsam_tool_stats_compacted.success_count + excluded.success_count AS REAL)
           / (agentsam_tool_stats_compacted.total_calls + excluded.total_calls)
         ELSE 0 END,
       total_cost_usd = agentsam_tool_stats_compacted.total_cost_usd + excluded.total_cost_usd,
       total_tokens = agentsam_tool_stats_compacted.total_tokens + excluded.total_tokens,
       avg_duration_ms = (
         agentsam_tool_stats_compacted.avg_duration_ms * agentsam_tool_stats_compacted.total_calls
         + excluded.avg_duration_ms * excluded.total_calls
       ) / MAX(agentsam_tool_stats_compacted.total_calls + excluded.total_calls, 1),
       p95_duration_ms = MAX(agentsam_tool_stats_compacted.p95_duration_ms, excluded.p95_duration_ms),
       first_seen_at = COALESCE(agentsam_tool_stats_compacted.first_seen_at, excluded.first_seen_at),
       last_seen_at = excluded.last_seen_at,
       compacted_at = excluded.compacted_at`
  )
    .bind(FNF_ACCOUNT_ID, start, end, FNF_ACCOUNT_ID, dateKey)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));

  return {
    ok: true,
    rows: dailyResult.meta?.changes ?? 0,
    lifetime_rows: lifetimeResult.meta?.changes ?? 0,
  };
}

export async function trimHotLogs(env, dateKey) {
  if (!env?.DB) return { ok: false, error: "DB not bound" };

  const analyticsCutoff = Math.floor(Date.now() / 1000) - RETENTION.analyticsHotDays * 86400;
  const promptCutoff = Math.floor(Date.now() / 1000) - RETENTION.promptUsageHotDays * 86400;
  const toolCutoff = Math.floor(Date.now() / 1000) - RETENTION.toolLogHotDays * 86400;

  const analytics = await env.DB.prepare(
    `DELETE FROM agentsam_analytics
     WHERE account_id = ? AND date_key <= ? AND created_at_unix < ?`
  )
    .bind(FNF_ACCOUNT_ID, dateKey, analyticsCutoff)
    .run();

  const promptUsage = await env.DB.prepare(
    `DELETE FROM agentsam_prompt_usage
     WHERE account_id = ? AND date_key <= ? AND created_at_unix < ?`
  )
    .bind(FNF_ACCOUNT_ID, dateKey, promptCutoff)
    .run();

  const toolCalls = await env.DB.prepare(
    `DELETE FROM agentsam_tool_call_log
     WHERE account_id = ? AND created_at < ?`
  )
    .bind(FNF_ACCOUNT_ID, toolCutoff)
    .run();

  const webhookPayloads = await env.DB.prepare(
    `UPDATE agentsam_webhook_events
     SET payload_json = NULL,
         headers_json = NULL
     WHERE id IN (
       SELECT id
       FROM agentsam_webhook_events
       WHERE account_id = ?
         AND payload_expires_at_unix IS NOT NULL
         AND payload_expires_at_unix <= unixepoch()
         AND (payload_json IS NOT NULL OR headers_json IS NOT NULL)
       ORDER BY payload_expires_at_unix
       LIMIT ?
     )`
  )
    .bind(FNF_ACCOUNT_ID, RETENTION.webhookCleanupBatch)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));

  const webhookEvents = await env.DB.prepare(
    `DELETE FROM agentsam_webhook_events
     WHERE id IN (
       SELECT id
       FROM agentsam_webhook_events
       WHERE account_id = ?
         AND expires_at_unix IS NOT NULL
         AND expires_at_unix <= unixepoch()
         AND status IN ('processed','ignored','failed','dead_letter')
       ORDER BY expires_at_unix
       LIMIT ?
     )`
  )
    .bind(FNF_ACCOUNT_ID, RETENTION.webhookCleanupBatch)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));

  const hookExecutions = await env.DB.prepare(
    `DELETE FROM agentsam_hook_execution
     WHERE id IN (
       SELECT id
       FROM agentsam_hook_execution
       WHERE account_id = ?
         AND expires_at_unix IS NOT NULL
         AND expires_at_unix <= unixepoch()
       ORDER BY expires_at_unix
       LIMIT ?
     )`
  )
    .bind(FNF_ACCOUNT_ID, RETENTION.webhookCleanupBatch)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));

  return {
    ok: true,
    analytics_deleted: analytics.meta?.changes ?? 0,
    prompt_usage_deleted: promptUsage.meta?.changes ?? 0,
    tool_call_deleted: toolCalls.meta?.changes ?? 0,
    webhook_payloads_shed: webhookPayloads.meta?.changes ?? 0,
    webhook_events_deleted: webhookEvents.meta?.changes ?? 0,
    hook_executions_deleted: hookExecutions.meta?.changes ?? 0,
  };
}

function summarizeJsonl(text, maxMessages = 12) {
  const lines = String(text || "")
    .split("\n")
    .filter(Boolean)
    .slice(-maxMessages);
  const parts = [];
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      const role = row.role || row.type || "message";
      const body = String(row.content || row.text || row.message || "").replace(/\s+/g, " ").trim();
      if (body) parts.push(`${role}: ${body.slice(0, 200)}`);
    } catch {
      /* skip bad line */
    }
  }
  return parts.join("\n").slice(0, 2000);
}

export async function refreshThreadSummaries(env, { limit = RETENTION.summaryRefreshLimit } = {}) {
  if (!env?.DB || !env?.WEBSITE_ASSETS) {
    return { ok: false, error: "DB or R2 not bound", refreshed: 0 };
  }

  const { results } = await env.DB.prepare(
    `SELECT id, title, r2_thread_key, r2_summary_key, message_count, last_active_unix
     FROM agentsam_conversations
     WHERE account_id = ? AND status = 'active' AND message_count > 0
     ORDER BY last_active_unix DESC
     LIMIT ?`
  )
    .bind(FNF_ACCOUNT_ID, limit)
    .all();

  let refreshed = 0;
  for (const conv of results || []) {
    const threadKey = conv.r2_thread_key || `agentsam/thread-payloads/${conv.id}/messages.jsonl`;
    const summaryKey = conv.r2_summary_key || `agentsam/thread-summaries/${conv.id}/latest.json`;
    try {
      const obj = await env.WEBSITE_ASSETS.get(threadKey);
      if (!obj) continue;
      const text = await obj.text();
      const excerpt = summarizeJsonl(text);
      if (!excerpt) continue;

      const payload = JSON.stringify({
        conversation_id: conv.id,
        title: conv.title,
        message_count: conv.message_count,
        summary: excerpt,
        refreshed_at: new Date().toISOString(),
      });

      await env.WEBSITE_ASSETS.put(summaryKey, payload, {
        httpMetadata: { contentType: "application/json; charset=utf-8" },
      });

      await env.DB.prepare(
        `UPDATE agentsam_conversations
         SET summary = ?, updated_at = datetime('now')
         WHERE id = ? AND account_id = ?`
      )
        .bind(excerpt.slice(0, 500), conv.id, FNF_ACCOUNT_ID)
        .run();

      refreshed += 1;
    } catch (err) {
      console.error("thread summary refresh failed", conv.id, err?.message || err);
    }
  }

  return { ok: true, refreshed };
}

export async function getCompactionStatus(env, { limit = 10 } = {}) {
  if (!env?.DB) {
    return { ok: false, runs: [], retention: RETENTION };
  }

  try {
    const { results: runs } = await env.DB.prepare(
      `SELECT id, date_key, trigger_source, status, started_at, finished_at, duration_ms,
              analytics_rows, prompt_usage_rows, tool_call_rows,
              analytics_deleted, prompt_usage_deleted, tool_call_deleted,
              summaries_refreshed, error_message
       FROM agentsam_compaction_runs
       WHERE account_id = ?
       ORDER BY started_at DESC
       LIMIT ?`
    )
      .bind(FNF_ACCOUNT_ID, limit)
      .all();

    const totals = await env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM agentsam_analytics WHERE account_id = ?) AS analytics_hot,
         (SELECT COUNT(*) FROM agentsam_prompt_usage WHERE account_id = ?) AS prompt_usage_hot,
         (SELECT COUNT(*) FROM agentsam_tool_call_log WHERE account_id = ?) AS tool_call_hot,
         (SELECT COUNT(*) FROM agentsam_analytics_daily WHERE account_id = ?) AS analytics_daily,
         (SELECT COUNT(*) FROM agentsam_prompt_usage_daily WHERE account_id = ?) AS prompt_usage_daily,
         (SELECT COUNT(*) FROM agentsam_tool_call_daily WHERE account_id = ?) AS tool_call_daily`
    )
      .bind(
        FNF_ACCOUNT_ID,
        FNF_ACCOUNT_ID,
        FNF_ACCOUNT_ID,
        FNF_ACCOUNT_ID,
        FNF_ACCOUNT_ID,
        FNF_ACCOUNT_ID
      )
      .first()
      .catch(() => null);

    return { ok: true, runs: runs || [], totals: totals || {}, retention: RETENTION };
  } catch (err) {
    console.error("[compaction/status]", err?.message || err);
    return { ok: false, runs: [], totals: {}, retention: RETENTION, error: "compaction_unavailable" };
  }
}

export async function runAgentsamCompaction(env, options = {}) {
  const startedMs = Date.now();
  const dateKey = options.date_key || yesterdayDateKey();
  const triggerSource = options.trigger_source || "cron";
  const force = options.force === true;
  const skipTrim = options.skip_trim === true;

  if (!env?.DB) {
    return { ok: false, error: "DB not bound", date_key: dateKey };
  }

  if (!force && (await hasCompactionForDate(env, dateKey))) {
    return { ok: true, skipped: true, reason: "already_compacted", date_key: dateKey };
  }

  const { runId, startedAt } = await startCompactionRun(env, dateKey, triggerSource);
  const stats = { date_key: dateKey, trigger_source: triggerSource };
  let status = "success";
  let errorMessage = null;

  try {
    stats.analytics = await rollupAnalyticsDaily(env, dateKey);
    stats.prompt_usage = await rollupPromptUsageDaily(env, dateKey);
    stats.tool_calls = await rollupToolCallDaily(env, dateKey);
    stats.summaries = await refreshThreadSummaries(env);

    if (!skipTrim) {
      stats.trim = await trimHotLogs(env, dateKey);
    } else {
      stats.trim = { ok: true, skipped: true };
    }

    await trackAgentSamEvent(
      env,
      {
        event_type: "system",
        event_name: "compaction_completed",
        status: "success",
        metadata: {
          date_key: dateKey,
          trigger_source: triggerSource,
          analytics_rows: stats.analytics?.rows ?? 0,
          prompt_usage_rows: stats.prompt_usage?.rows ?? 0,
          tool_call_rows: stats.tool_calls?.rows ?? 0,
          summaries_refreshed: stats.summaries?.refreshed ?? 0,
        },
      },
      {}
    ).catch(() => {});
  } catch (err) {
    status = "failed";
    errorMessage = err?.message || String(err);
    stats.error = errorMessage;
    console.error("agentsam compaction failed", errorMessage);

    await trackAgentSamEvent(
      env,
      {
        event_type: "system",
        event_name: "compaction_failed",
        status: "failed",
        error_message: errorMessage,
        metadata: { date_key: dateKey, trigger_source: triggerSource },
      },
      {}
    ).catch(() => {});
  }

  await finishCompactionRun(env, runId, {
    status,
    duration_ms: Date.now() - startedMs,
    analytics_rows: stats.analytics?.rows ?? 0,
    prompt_usage_rows: stats.prompt_usage?.rows ?? 0,
    tool_call_rows: stats.tool_calls?.rows ?? 0,
    analytics_deleted: stats.trim?.analytics_deleted ?? 0,
    prompt_usage_deleted: stats.trim?.prompt_usage_deleted ?? 0,
    tool_call_deleted: stats.trim?.tool_call_deleted ?? 0,
    summaries_refreshed: stats.summaries?.refreshed ?? 0,
    error_message: errorMessage,
    stats,
  });

  return {
    ok: status === "success",
    run_id: runId,
    date_key: dateKey,
    status,
    duration_ms: Date.now() - startedMs,
    ...stats,
  };
}

/** @deprecated use rollupToolCallDaily */
export async function compactToolCallStats(env, dateKey) {
  return rollupToolCallDaily(env, dateKey || yesterdayDateKey());
}
