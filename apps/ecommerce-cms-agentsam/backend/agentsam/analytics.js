/**
 * AgentSam analytics — lightweight D1 event ledger.
 * Never throws; never stores secrets or full prompts by default.
 */

import { FNF_ACCOUNT_ID } from "./constants.js";

const PREVIEW_MAX = 240;
const ERROR_MAX = 500;

const COST_RATE = {
  low: 0.00000015,
  medium: 0.0000006,
  high: 0.000002,
  unknown: 0.0000004,
};

const INSERT_SQL = `
INSERT INTO agentsam_analytics (
  account_id, event_type, event_name, status, source, environment,
  session_id, conversation_id, message_id, run_id,
  workflow_id, workflow_key, workflow_run_id,
  user_id, admin_user_id, user_email,
  intent, route_lane, task_type, selected_mode,
  provider, model_id, model_lane, fallback_used, fallback_attempt_index, attempted_models_json,
  mcp_server, mcp_tool, mcp_success, mcp_latency_ms,
  github_repo, github_branch, github_operation,
  channel, campaign_id, product_id, variant_id, order_id, customer_id, integration_key, operation,
  entity_type, entity_id, entity_label,
  input_chars, output_chars, prompt_preview, prompt_hash, response_preview, response_hash,
  input_tokens, output_tokens, total_tokens, estimated_cost_usd,
  duration_ms, ai_latency_ms, routing_latency_ms, total_latency_ms,
  quality_score, user_feedback,
  error_code, error_message, error_stage,
  metadata_json
) VALUES (
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?,
  ?, ?, ?,
  ?
)`;

export function sanitizeAnalyticsText(text, maxLength = PREVIEW_MAX) {
  let s = String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\b(sk_(live|test)_[A-Za-z0-9]+)/gi, "[redacted]")
    .replace(/\b(pk_(live|test)_[A-Za-z0-9]+)/gi, "[redacted]")
    .replace(/\b(ghp_[A-Za-z0-9]+)/gi, "[redacted]")
    .replace(/\b(github_pat_[A-Za-z0-9_]+)/gi, "[redacted]")
    .replace(/\b(Bearer\s+[A-Za-z0-9._-]+)/gi, "Bearer [redacted]")
    .replace(/\b(AGENTSAM_BRIDGE_KEY|FNF_GITHUB_TOKEN|IAM_MCP_TOKEN)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .trim();

  if (s.length > maxLength) {
    return `${s.slice(0, maxLength)}…`;
  }
  return s;
}

function sanitizeErrorMessage(text) {
  return sanitizeAnalyticsText(text, ERROR_MAX);
}

export async function hashAnalyticsText(text) {
  if (text == null || text === "") return null;
  try {
    const data = new TextEncoder().encode(String(text));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(String(text).length / 4));
}

export function estimateCostUsd(inputTokens, outputTokens, costTier = "unknown") {
  const rate = COST_RATE[costTier] ?? COST_RATE.unknown;
  return Number(((inputTokens + outputTokens) * rate).toFixed(8));
}

function compactMetadata(value) {
  if (value == null) return "{}";
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify({ value: sanitizeAnalyticsText(value, 120) });
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function pickDefined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function boolInt(value) {
  return value ? 1 : 0;
}

async function insertEvent(env, row) {
  if (!env?.DB) return false;

  await env.DB.prepare(INSERT_SQL)
    .bind(
      row.account_id,
      row.event_type,
      row.event_name,
      row.status,
      row.source,
      row.environment,
      row.session_id,
      row.conversation_id,
      row.message_id,
      row.run_id,
      row.workflow_id,
      row.workflow_key,
      row.workflow_run_id,
      row.user_id,
      row.admin_user_id,
      row.user_email,
      row.intent,
      row.route_lane,
      row.task_type,
      row.selected_mode,
      row.provider,
      row.model_id,
      row.model_lane,
      row.fallback_used,
      row.fallback_attempt_index,
      row.attempted_models_json,
      row.mcp_server,
      row.mcp_tool,
      row.mcp_success,
      row.mcp_latency_ms,
      row.github_repo,
      row.github_branch,
      row.github_operation,
      row.channel,
      row.campaign_id,
      row.product_id,
      row.variant_id,
      row.order_id,
      row.customer_id,
      row.integration_key,
      row.operation,
      row.entity_type,
      row.entity_id,
      row.entity_label,
      row.input_chars,
      row.output_chars,
      row.prompt_preview,
      row.prompt_hash,
      row.response_preview,
      row.response_hash,
      row.input_tokens,
      row.output_tokens,
      row.total_tokens,
      row.estimated_cost_usd,
      row.duration_ms,
      row.ai_latency_ms,
      row.routing_latency_ms,
      row.total_latency_ms,
      row.quality_score,
      row.user_feedback,
      row.error_code,
      row.error_message,
      row.error_stage,
      row.metadata_json
    )
    .run();

  return true;
}

async function buildRow(env, event, options = {}) {
  const merged = pickDefined({ ...options, ...event });
  const promptText = merged.prompt_text ?? merged.user_message ?? null;
  const responseText = merged.response_text ?? merged.reply ?? null;

  const promptPreview =
    merged.prompt_preview ??
    (promptText != null ? sanitizeAnalyticsText(promptText) : null);
  const responsePreview =
    merged.response_preview ??
    (responseText != null ? sanitizeAnalyticsText(responseText) : null);

  const promptHash =
    merged.prompt_hash ?? (promptText != null ? await hashAnalyticsText(promptText) : null);
  const responseHash =
    merged.response_hash ??
    (responseText != null ? await hashAnalyticsText(responseText) : null);

  const inputChars = merged.input_chars ?? (promptText ? String(promptText).length : 0);
  const outputChars = merged.output_chars ?? (responseText ? String(responseText).length : 0);
  const inputTokens = merged.input_tokens ?? estimateTokens(promptText);
  const outputTokens = merged.output_tokens ?? estimateTokens(responseText);
  const totalTokens = merged.total_tokens ?? inputTokens + outputTokens;

  return {
    account_id: merged.account_id || FNF_ACCOUNT_ID,
    event_type: merged.event_type,
    event_name: merged.event_name,
    status: merged.status || "success",
    source: merged.source || "admin_agentsam",
    environment: merged.environment || "production",
    session_id: merged.session_id ?? null,
    conversation_id: merged.conversation_id ?? null,
    message_id: merged.message_id ?? null,
    run_id: merged.run_id ?? null,
    workflow_id: merged.workflow_id ?? null,
    workflow_key: merged.workflow_key ?? null,
    workflow_run_id: merged.workflow_run_id ?? null,
    user_id: merged.user_id ?? merged.admin_user_id ?? null,
    admin_user_id: merged.admin_user_id ?? merged.user_id ?? null,
    user_email: merged.user_email ?? null,
    intent: merged.intent ?? null,
    route_lane: merged.route_lane ?? merged.model_lane ?? null,
    task_type: merged.task_type ?? null,
    selected_mode: merged.selected_mode ?? null,
    provider: merged.provider ?? "workers_ai",
    model_id: merged.model_id ?? null,
    model_lane: merged.model_lane ?? null,
    fallback_used: boolInt(merged.fallback_used),
    fallback_attempt_index: merged.fallback_attempt_index ?? 0,
    attempted_models_json: compactMetadata(
      merged.attempted_models_json ?? merged.attempted_models ?? []
    ),
    mcp_server: merged.mcp_server ?? null,
    mcp_tool: merged.mcp_tool ?? null,
    mcp_success: merged.mcp_success == null ? null : boolInt(merged.mcp_success),
    mcp_latency_ms: merged.mcp_latency_ms ?? null,
    github_repo: merged.github_repo ?? null,
    github_branch: merged.github_branch ?? null,
    github_operation: merged.github_operation ?? null,
    channel: merged.channel ?? null,
    campaign_id: merged.campaign_id ?? null,
    product_id: merged.product_id ?? null,
    variant_id: merged.variant_id ?? null,
    order_id: merged.order_id ?? null,
    customer_id: merged.customer_id ?? null,
    integration_key: merged.integration_key ?? null,
    operation: merged.operation ?? null,
    entity_type: merged.entity_type ?? null,
    entity_id: merged.entity_id ?? null,
    entity_label: merged.entity_label ?? null,
    input_chars: inputChars,
    output_chars: outputChars,
    prompt_preview: promptPreview,
    prompt_hash: promptHash,
    response_preview: responsePreview,
    response_hash: responseHash,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd:
      merged.estimated_cost_usd ??
      estimateCostUsd(inputTokens, outputTokens, merged.cost_tier),
    duration_ms: merged.duration_ms ?? null,
    ai_latency_ms: merged.ai_latency_ms ?? null,
    routing_latency_ms: merged.routing_latency_ms ?? null,
    total_latency_ms: merged.total_latency_ms ?? null,
    quality_score: merged.quality_score ?? null,
    user_feedback: merged.user_feedback ?? null,
    error_code: merged.error_code ?? null,
    error_message: merged.error_message
      ? sanitizeErrorMessage(merged.error_message)
      : null,
    error_stage: merged.error_stage ?? null,
    metadata_json: compactMetadata(merged.metadata_json ?? merged.metadata ?? {}),
  };
}

/**
 * Track an AgentSam analytics event. Never throws.
 * Pass options.ctx (execution context) for non-blocking waitUntil inserts.
 */
export async function trackAgentSamEvent(env, event, options = {}) {
  try {
    if (!event?.event_type || !event?.event_name) return { tracked: false };

    const row = await buildRow(env, event, options);
    const write = insertEvent(env, row).catch((err) => {
      console.error("agentsam analytics insert failed", err?.message || err);
    });

    const waitUntil = options.ctx?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(write);
      return { tracked: true, async: true };
    }

    await write;
    return { tracked: true, async: false };
  } catch (err) {
    console.error("agentsam analytics track failed", err?.message || err);
    return { tracked: false };
  }
}

function rangeSeconds(range = "24h") {
  if (range === "7d") return 7 * 86400;
  if (range === "1h") return 3600;
  return 86400;
}

export async function summarizeAgentSamAnalytics(env, options = {}) {
  const accountId = options.account_id || FNF_ACCOUNT_ID;
  const since = Math.floor(Date.now() / 1000) - rangeSeconds(options.range || "24h");

  if (!env?.DB) {
    return {
      ok: true,
      range: options.range || "24h",
      totals: {},
      by_workflow: [],
      by_model: [],
      recent_errors: [],
      latency: {},
    };
  }

  try {
    const totalsRow = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN event_type = 'chat' AND event_name = 'chat_response_completed' THEN 1 ELSE 0 END) AS chats,
         SUM(CASE WHEN event_type = 'error' OR status = 'failed' THEN 1 ELSE 0 END) AS errors,
         SUM(CASE WHEN event_type = 'ai_model' AND event_name = 'model_fallback' THEN 1 ELSE 0 END) AS fallbacks,
         SUM(CASE WHEN event_type = 'mcp' THEN 1 ELSE 0 END) AS mcp_calls,
         SUM(CASE WHEN event_type = 'github' THEN 1 ELSE 0 END) AS github_calls,
         SUM(CASE WHEN event_type = 'image' THEN 1 ELSE 0 END) AS image_requests,
         SUM(CASE WHEN event_type = 'approval' THEN 1 ELSE 0 END) AS approvals_required,
         COALESCE(SUM(estimated_cost_usd), 0) AS estimated_cost_usd
       FROM agentsam_analytics
       WHERE account_id = ?
         AND created_at_unix >= ?`
    )
      .bind(accountId, since)
      .first();

    const { results: byWorkflow } = await env.DB.prepare(
      `SELECT
         workflow_key,
         COUNT(*) AS events,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failures,
         AVG(total_latency_ms) AS avg_latency_ms,
         SUM(estimated_cost_usd) AS estimated_cost_usd
       FROM agentsam_analytics
       WHERE account_id = ?
         AND created_at_unix >= ?
         AND workflow_key IS NOT NULL
       GROUP BY workflow_key
       ORDER BY events DESC
       LIMIT 12`
    )
      .bind(accountId, since)
      .all();

    const { results: byModel } = await env.DB.prepare(
      `SELECT
         model_id,
         COUNT(*) AS uses,
         SUM(CASE WHEN status = 'fallback' THEN 1 ELSE 0 END) AS fallbacks,
         AVG(ai_latency_ms) AS avg_ai_latency_ms,
         SUM(estimated_cost_usd) AS estimated_cost_usd
       FROM agentsam_analytics
       WHERE account_id = ?
         AND model_id IS NOT NULL
         AND created_at_unix >= ?
       GROUP BY model_id
       ORDER BY uses DESC
       LIMIT 12`
    )
      .bind(accountId, since)
      .all();

    const { results: recentErrors } = await env.DB.prepare(
      `SELECT event_type, event_name, status, workflow_key, model_id, error_code, error_message, created_at
       FROM agentsam_analytics
       WHERE account_id = ?
         AND (event_type = 'error' OR status = 'failed')
         AND created_at_unix >= ?
       ORDER BY created_at_unix DESC
       LIMIT 10`
    )
      .bind(accountId, since)
      .all();

    const latencyRow = await env.DB.prepare(
      `SELECT
         AVG(total_latency_ms) AS avg_total_latency_ms,
         AVG(ai_latency_ms) AS avg_ai_latency_ms
       FROM agentsam_analytics
       WHERE account_id = ?
         AND event_name = 'chat_response_completed'
         AND created_at_unix >= ?`
    )
      .bind(accountId, since)
      .first();

    return {
      ok: true,
      range: options.range || "24h",
      totals: {
        chats: totalsRow?.chats ?? 0,
        errors: totalsRow?.errors ?? 0,
        fallbacks: totalsRow?.fallbacks ?? 0,
        mcp_calls: totalsRow?.mcp_calls ?? 0,
        github_calls: totalsRow?.github_calls ?? 0,
        image_requests: totalsRow?.image_requests ?? 0,
        approvals_required: totalsRow?.approvals_required ?? 0,
        estimated_cost_usd: totalsRow?.estimated_cost_usd ?? 0,
      },
      by_workflow: byWorkflow || [],
      by_model: byModel || [],
      recent_errors: recentErrors || [],
      latency: {
        avg_total_latency_ms: latencyRow?.avg_total_latency_ms ?? null,
        avg_ai_latency_ms: latencyRow?.avg_ai_latency_ms ?? null,
      },
    };
  } catch (err) {
    console.error("agentsam analytics summary failed", err?.message || err);
    return {
      ok: false,
      range: options.range || "24h",
      error: "summary_unavailable",
      totals: {},
      by_workflow: [],
      by_model: [],
      recent_errors: [],
      latency: {},
    };
  }
}

export async function getAgentSamAnalyticsStatus(env) {
  const today = new Date().toISOString().slice(0, 10);

  if (!env?.DB) {
    return {
      analytics_enabled: false,
      chats_today: 0,
      errors_today: 0,
      fallback_rate: 0,
      estimated_ai_cost_today: 0,
      top_model_today: null,
      top_workflow_today: null,
      avg_latency_today_ms: null,
    };
  }

  try {
    const totals = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN event_name = 'chat_response_completed' THEN 1 ELSE 0 END) AS chats,
         SUM(CASE WHEN event_type = 'error' OR status = 'failed' THEN 1 ELSE 0 END) AS errors,
         SUM(CASE WHEN event_name = 'model_fallback' THEN 1 ELSE 0 END) AS fallbacks,
         COALESCE(SUM(estimated_cost_usd), 0) AS cost,
         AVG(total_latency_ms) AS avg_latency
       FROM agentsam_analytics
       WHERE account_id = ?
         AND date_key = ?`
    )
      .bind(FNF_ACCOUNT_ID, today)
      .first();

    const topModel = await env.DB.prepare(
      `SELECT model_id, COUNT(*) AS n
       FROM agentsam_analytics
       WHERE account_id = ? AND date_key = ? AND model_id IS NOT NULL
       GROUP BY model_id
       ORDER BY n DESC
       LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, today)
      .first();

    const topWorkflow = await env.DB.prepare(
      `SELECT workflow_key, COUNT(*) AS n
       FROM agentsam_analytics
       WHERE account_id = ? AND date_key = ? AND workflow_key IS NOT NULL
       GROUP BY workflow_key
       ORDER BY n DESC
       LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, today)
      .first();

    const chats = totals?.chats ?? 0;
    const fallbacks = totals?.fallbacks ?? 0;

    return {
      analytics_enabled: true,
      chats_today: chats,
      errors_today: totals?.errors ?? 0,
      fallback_rate: chats > 0 ? Number((fallbacks / chats).toFixed(4)) : 0,
      estimated_ai_cost_today: totals?.cost ?? 0,
      top_model_today: topModel?.model_id ?? null,
      top_workflow_today: topWorkflow?.workflow_key ?? null,
      avg_latency_today_ms: totals?.avg_latency ?? null,
    };
  } catch {
    return {
      analytics_enabled: false,
      chats_today: 0,
      errors_today: 0,
      fallback_rate: 0,
      estimated_ai_cost_today: 0,
      top_model_today: null,
      top_workflow_today: null,
      avg_latency_today_ms: null,
    };
  }
}

export function createAnalyticsIds(body = {}, context = {}) {
  return {
    session_id: body.session_id || context.session_id || `sess_${crypto.randomUUID()}`,
    conversation_id:
      body.conversation_id || context.conversation_id || `conv_${crypto.randomUUID()}`,
    message_id: `msg_${crypto.randomUUID()}`,
    run_id: `run_${crypto.randomUUID()}`,
  };
}
