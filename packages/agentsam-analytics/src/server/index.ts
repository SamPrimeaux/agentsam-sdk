/**
 * Package-owned operational D1 queries. The host resolves the verified session
 * and passes the account ID; there are no client- or environment-owned identities.
 * Every SQL statement is scoped before a D1 query can execute.
 */
export interface AnalyticsStatement {
  bind(...values: Array<string | number>): AnalyticsStatement;
  first(): Promise<AnalyticsRow | null>;
  all(): Promise<{ results?: AnalyticsRow[] }>;
}
export interface AnalyticsDatabase {
  prepare(sql: string): AnalyticsStatement;
}
export type AnalyticsRow = Record<string, unknown>;
export type AnalyticsQueryContext = {
  db: AnalyticsDatabase;
  accountId: string;
};
const SCOPE_PREDICATE = "WHERE account_id = ? AND created_at_unix >= ?";
function assertScopedSql(sql: string): void {
  if (!sql.includes(SCOPE_PREDICATE)) throw new TypeError("unscoped_analytics_query_rejected");
}

const VALID_RANGES = new Set(["24h", "7d", "30d", "90d", "YTD", "All"]);

export function normalizeAnalyticsRange(value: unknown) {
  const requested = String(value ?? "");
  return VALID_RANGES.has(requested) ? requested : "30d";
}

export function rangeStartUnix(range: unknown, nowUnix = Math.floor(Date.now() / 1000)) {
  const normalized = normalizeAnalyticsRange(range);

  if (normalized === "All") return 0;
  if (normalized === "24h") return nowUnix - 86_400;
  if (normalized === "7d") return nowUnix - 604_800;
  if (normalized === "30d") return nowUnix - 2_592_000;
  if (normalized === "90d") return nowUnix - 7_776_000;

  const now = new Date(nowUnix * 1000);
  return Math.floor(Date.UTC(now.getUTCFullYear(), 0, 1) / 1000);
}

const number = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const nullableNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

async function all(ctx: AnalyticsQueryContext, sql: string, ...bindings: Array<string | number>) {
  assertScopedSql(sql);
  const result = await ctx.db.prepare(sql).bind(ctx.accountId, ...bindings).all();
  return result?.results || [];
}

async function first(ctx: AnalyticsQueryContext, sql: string, ...bindings: Array<string | number>) {
  assertScopedSql(sql);
  return (await ctx.db.prepare(sql).bind(ctx.accountId, ...bindings).first()) || {};
}

async function summary(ctx: AnalyticsQueryContext, since: number) {
  const row = await first(
    ctx,
    `
      SELECT
        COUNT(*) AS total_events,
        SUM(CASE WHEN outcome IN ('passed','success','succeeded','completed','ok') THEN 1 ELSE 0 END) AS successful_events,
        SUM(CASE WHEN outcome IN ('failed','error','blocked','timeout','cancelled') THEN 1 ELSE 0 END) AS failed_events,
        COALESCE(SUM(cost_usd), 0) AS total_cost_usd,
        AVG(duration_ms) AS average_duration_ms,
        COALESCE(SUM(retry_count), 0) AS total_retries
      FROM agentsam_analytics
      WHERE account_id = ? AND created_at_unix >= ?
    `,
    since,
  );

  const total = number(row.total_events);
  const successful = number(row.successful_events);

  return {
    total_events: total,
    successful_events: successful,
    failed_events: number(row.failed_events),
    success_rate: ratio(successful, total),
    total_cost_usd: number(row.total_cost_usd),
    average_duration_ms: nullableNumber(row.average_duration_ms),
    total_retries: number(row.total_retries),
  };
}

async function operations(ctx: AnalyticsQueryContext, since: number, limit = 50) {
  const rows = await all(
    ctx,
    `
      SELECT
        domain,
        operation,
        COUNT(*) AS samples,
        SUM(CASE WHEN outcome IN ('passed','success','succeeded','completed','ok') THEN 1 ELSE 0 END) AS successes,
        SUM(CASE WHEN outcome IN ('failed','error','blocked','timeout','cancelled') THEN 1 ELSE 0 END) AS failures,
        AVG(duration_ms) AS average_duration_ms,
        MAX(duration_ms) AS max_duration_ms,
        AVG(queue_wait_ms) AS average_queue_wait_ms,
        AVG(external_wait_ms) AS average_external_wait_ms,
        AVG(active_model_ms) AS average_active_model_ms,
        COALESCE(SUM(retry_count), 0) AS total_retries,
        COALESCE(SUM(cost_usd), 0) AS total_cost_usd
      FROM agentsam_analytics
      WHERE account_id = ? AND created_at_unix >= ?
      GROUP BY domain, operation
      ORDER BY samples DESC, failures DESC
      LIMIT ?
    `,
    since,
    limit,
  );

  return rows.map((row) => {
    const samples = number(row.samples);
    const successes = number(row.successes);

    return {
      domain: String(row.domain || "unknown"),
      operation: String(row.operation || "unknown"),
      samples,
      successes,
      failures: number(row.failures),
      success_rate: ratio(successes, samples),
      average_duration_ms: nullableNumber(row.average_duration_ms),
      max_duration_ms: nullableNumber(row.max_duration_ms),
      average_queue_wait_ms: nullableNumber(row.average_queue_wait_ms),
      average_external_wait_ms: nullableNumber(row.average_external_wait_ms),
      average_active_model_ms: nullableNumber(row.average_active_model_ms),
      total_retries: number(row.total_retries),
      total_cost_usd: number(row.total_cost_usd),
    };
  });
}

async function timeline(ctx: AnalyticsQueryContext, since: number, range: string) {
  const bucket =
    range === "24h"
      ? "strftime('%Y-%m-%dT%H:00:00Z', created_at_unix, 'unixepoch')"
      : "strftime('%Y-%m-%d', created_at_unix, 'unixepoch')";

  const rows = await all(
    ctx,
    `
      SELECT
        ${bucket} AS bucket,
        COUNT(*) AS events,
        SUM(CASE WHEN outcome IN ('failed','error','blocked','timeout','cancelled') THEN 1 ELSE 0 END) AS failures,
        COALESCE(SUM(cost_usd), 0) AS cost_usd,
        COALESCE(SUM(duration_ms), 0) AS duration_ms
      FROM agentsam_analytics
      WHERE account_id = ? AND created_at_unix >= ?
      GROUP BY bucket
      ORDER BY bucket ASC
      LIMIT 500
    `,
    since,
  );

  return rows.map((row) => ({
    bucket: String(row.bucket),
    events: number(row.events),
    failures: number(row.failures),
    cost_usd: number(row.cost_usd),
    duration_ms: number(row.duration_ms),
  }));
}

async function overview(ctx: AnalyticsQueryContext, range: string, since: number) {
  const [totals, points, top] = await Promise.all([
    summary(ctx, since),
    timeline(ctx, since, range),
    operations(ctx, since, 20),
  ]);

  return {
    range,
    generated_at: new Date().toISOString(),
    summary: totals,
    timeline: points,
    top_operations: top,
  };
}

async function usage(ctx: AnalyticsQueryContext, range: string, since: number) {
  // Model usage has its own account-scoped ledger. agentsam_analytics is an
  // operational fact stream and must not be treated as the source of truth for
  // token and model-cost totals.
  const [totals, rows] = await Promise.all([
    first(
      ctx,
      "SELECT COALESCE(SUM(input_tokens),0) AS input_tokens, " +
        "COALESCE(SUM(cached_input_tokens),0) AS cached_input_tokens, " +
        "COALESCE(SUM(output_tokens),0) AS output_tokens, " +
        "COALESCE(SUM(reasoning_tokens),0) AS reasoning_tokens, " +
        "COALESCE(SUM(cost_usd),0) AS total_cost_usd " +
        "FROM agentsam_usage_events WHERE account_id = ? AND created_at_unix >= ?",
      since,
    ),
    all(
      ctx,
      "SELECT provider, model_key, COUNT(*) AS samples, " +
        "COALESCE(SUM(input_tokens),0) AS input_tokens, " +
        "COALESCE(SUM(cached_input_tokens),0) AS cached_input_tokens, " +
        "COALESCE(SUM(output_tokens),0) AS output_tokens, " +
        "COALESCE(SUM(reasoning_tokens),0) AS reasoning_tokens, " +
        "COALESCE(SUM(cost_usd),0) AS total_cost_usd " +
        "FROM agentsam_usage_events WHERE account_id = ? AND created_at_unix >= ? " +
        "GROUP BY provider, model_key ORDER BY total_cost_usd DESC, samples DESC LIMIT 100",
      since,
    ),
  ]);

  return {
    range,
    generated_at: new Date().toISOString(),
    totals: {
      input_tokens: number(totals.input_tokens),
      cached_input_tokens: number(totals.cached_input_tokens),
      output_tokens: number(totals.output_tokens),
      reasoning_tokens: number(totals.reasoning_tokens),
      total_cost_usd: number(totals.total_cost_usd),
    },
    by_provider_model: rows.map((row) => ({
      provider: row.provider == null ? null : String(row.provider),
      model_key: row.model_key == null ? null : String(row.model_key),
      samples: number(row.samples),
      input_tokens: number(row.input_tokens),
      cached_input_tokens: number(row.cached_input_tokens),
      output_tokens: number(row.output_tokens),
      reasoning_tokens: number(row.reasoning_tokens),
      total_cost_usd: number(row.total_cost_usd),
    })),
  };
}

async function performance(ctx: AnalyticsQueryContext, range: string, since: number) {
  return {
    range,
    generated_at: new Date().toISOString(),
    operations: await operations(ctx, since, 100),
  };
}

async function health(ctx: AnalyticsQueryContext, range: string, since: number) {
  const [totals, clusters, recent] = await Promise.all([
    summary(ctx, since),
    all(
      ctx,
      `
        SELECT
          domain,
          operation,
          error_code,
          failure_origin,
          COUNT(*) AS failures
        FROM agentsam_analytics
        WHERE account_id = ? AND created_at_unix >= ?
          AND outcome IN ('failed','error','blocked','timeout','cancelled')
        GROUP BY domain, operation, error_code, failure_origin
        ORDER BY failures DESC
        LIMIT 50
      `,
      since,
    ),
    all(
      ctx,
      `
        SELECT
          id,
          domain,
          operation,
          error_code,
          failure_origin,
          artifact_ref,
          created_at_unix
        FROM agentsam_analytics
        WHERE account_id = ? AND created_at_unix >= ?
          AND outcome IN ('failed','error','blocked','timeout','cancelled')
        ORDER BY created_at_unix DESC
        LIMIT 50
      `,
      since,
    ),
  ]);

  return {
    range,
    generated_at: new Date().toISOString(),
    summary: totals,
    failure_clusters: clusters.map((row) => ({
      domain: String(row.domain || "unknown"),
      operation: String(row.operation || "unknown"),
      error_code: row.error_code == null ? null : String(row.error_code),
      failure_origin:
        row.failure_origin == null ? null : String(row.failure_origin),
      failures: number(row.failures),
    })),
    recent_failures: recent.map((row) => ({
      id: String(row.id),
      domain: String(row.domain || "unknown"),
      operation: String(row.operation || "unknown"),
      error_code: row.error_code == null ? null : String(row.error_code),
      failure_origin:
        row.failure_origin == null ? null : String(row.failure_origin),
      artifact_ref:
        row.artifact_ref == null ? null : String(row.artifact_ref),
      created_at_unix: number(row.created_at_unix),
    })),
  };
}

async function scores(ctx: AnalyticsQueryContext, range: string, since: number) {
  const rows = await all(
    ctx,
    `
      SELECT
        score_family,
        weights_version,
        COUNT(*) AS samples,
        AVG(score_value) AS average_score,
        MIN(score_value) AS min_score,
        MAX(score_value) AS max_score
      FROM agentsam_analytics
      WHERE account_id = ? AND created_at_unix >= ?
        AND score_family IS NOT NULL
        AND score_value IS NOT NULL
        AND weights_version IS NOT NULL
      GROUP BY score_family, weights_version
      ORDER BY score_family ASC, weights_version DESC
      LIMIT 100
    `,
    since,
  );

  return {
    range,
    generated_at: new Date().toISOString(),
    families: rows.map((row) => ({
      score_family: String(row.score_family),
      weights_version: String(row.weights_version),
      samples: number(row.samples),
      average_score: number(row.average_score),
      min_score: number(row.min_score),
      max_score: number(row.max_score),
    })),
  };
}

/** Account-scoped tool execution receipts from the canonical D1 tool-call ledger. */
export async function queryAgentSamToolUsage(ctx: AnalyticsQueryContext, rawRange: unknown) {
  if (!ctx?.db || typeof ctx.db.prepare !== "function") {
    throw new TypeError("analytics DB binding unavailable");
  }
  if (!ctx?.accountId || typeof ctx.accountId !== "string" || !ctx.accountId.trim()) {
    throw Object.assign(new Error("authenticated_account_required"), { status: 401 });
  }

  const range = normalizeAnalyticsRange(rawRange);
  const since = rangeStartUnix(range);
  const bucket = range === "24h"
    ? "strftime('%Y-%m-%dT%H:00:00Z', created_at_unix, 'unixepoch')"
    : "strftime('%Y-%m-%d', created_at_unix, 'unixepoch')";

  const [summaryRows, toolRows, dayRows, failureRows] = await Promise.all([
    all(ctx, `
      SELECT
        COUNT(*) AS calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
        SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures,
        AVG(duration_ms) AS average_duration_ms,
        COALESCE(SUM(CASE WHEN cost_basis IN ('api_metered','external_subscription') THEN cost_usd ELSE 0 END), 0) AS recorded_cost_usd,
        SUM(CASE WHEN cost_basis IN ('api_metered','external_subscription') AND cost_usd > 0 THEN 1 ELSE 0 END) AS priced_calls,
        MIN(created_at_unix) AS first_event_unix,
        MAX(created_at_unix) AS last_event_unix
      FROM agentsam_tool_call_log
      WHERE account_id = ? AND created_at_unix >= ?
    `, since),
    all(ctx, `
      SELECT
        tool_key,
        COUNT(*) AS calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
        SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures,
        AVG(duration_ms) AS average_duration_ms,
        COALESCE(SUM(CASE WHEN cost_basis IN ('api_metered','external_subscription') THEN cost_usd ELSE 0 END), 0) AS recorded_cost_usd,
        SUM(CASE WHEN cost_basis IN ('api_metered','external_subscription') AND cost_usd > 0 THEN 1 ELSE 0 END) AS priced_calls
      FROM agentsam_tool_call_log
      WHERE account_id = ? AND created_at_unix >= ?
      GROUP BY tool_key
      ORDER BY calls DESC, tool_key ASC
      LIMIT 100
    `, since),
    all(ctx, `
      SELECT
        ${bucket} AS bucket,
        COUNT(*) AS calls,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
        SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) AS failures,
        COALESCE(SUM(CASE WHEN cost_basis IN ('api_metered','external_subscription') THEN cost_usd ELSE 0 END), 0) AS recorded_cost_usd
      FROM agentsam_tool_call_log
      WHERE account_id = ? AND created_at_unix >= ?
      GROUP BY bucket
      ORDER BY bucket ASC
      LIMIT 500
    `, since),
    all(ctx, `
      SELECT id, tool_key, status, error_code, failure_origin, duration_ms, cost_usd, created_at_unix
      FROM agentsam_tool_call_log
      WHERE account_id = ? AND created_at_unix >= ? AND status != 'success'
      ORDER BY created_at_unix DESC
      LIMIT 50
    `, since),
  ]);

  const summaryRow = summaryRows[0] || {};
  return {
    schema: "agentsam.tool-usage.v2",
    range,
    scope: "authenticated_account",
    totals: {
      calls: number(summaryRow.calls),
      successes: number(summaryRow.successes),
      failures: number(summaryRow.failures),
      average_duration_ms: nullableNumber(summaryRow.average_duration_ms),
      recorded_cost_usd: number(summaryRow.recorded_cost_usd),
      priced_calls: number(summaryRow.priced_calls),
      first_event_unix: nullableNumber(summaryRow.first_event_unix),
      last_event_unix: nullableNumber(summaryRow.last_event_unix),
    },
    coverage: {
      measured_calls: number(summaryRow.priced_calls),
      unpriced_calls: Math.max(0, number(summaryRow.calls) - number(summaryRow.priced_calls)),
    },
    by_tool: toolRows.map((row) => ({
      tool_key: String(row.tool_key),
      calls: number(row.calls),
      successes: number(row.successes),
      failures: number(row.failures),
      average_duration_ms: nullableNumber(row.average_duration_ms),
      recorded_cost_usd: number(row.recorded_cost_usd),
      priced_calls: number(row.priced_calls),
    })),
    by_day: dayRows.map((row) => ({
      bucket: String(row.bucket),
      calls: number(row.calls),
      successes: number(row.successes),
      failures: number(row.failures),
      recorded_cost_usd: number(row.recorded_cost_usd),
    })),
    recent_failures: failureRows.map((row) => ({
      id: String(row.id),
      tool_key: String(row.tool_key),
      status: String(row.status),
      error_code: row.error_code == null ? "" : String(row.error_code),
      failure_origin: row.failure_origin == null ? null : String(row.failure_origin),
      duration_ms: nullableNumber(row.duration_ms),
      cost_usd: number(row.cost_usd),
      created_at_unix: number(row.created_at_unix),
    })),
  };
}


/** Account-scoped agent-run receipts from the canonical D1 run ledger. */
export async function queryAgentSamAgentRuns(ctx: AnalyticsQueryContext, rawRange: unknown) {
  if (!ctx?.db || typeof ctx.db.prepare !== "function") {
    throw new TypeError("analytics DB binding unavailable");
  }
  if (!ctx?.accountId || typeof ctx.accountId !== "string" || !ctx.accountId.trim()) {
    throw Object.assign(new Error("authenticated_account_required"), { status: 401 });
  }

  const range = normalizeAnalyticsRange(rawRange);
  const since = rangeStartUnix(range);
  const bucket = range === "24h"
    ? "strftime('%Y-%m-%dT%H:00:00Z', created_at_unix, 'unixepoch')"
    : "strftime('%Y-%m-%d', created_at_unix, 'unixepoch')";
  const [summaryRows, dayRows, failureRows] = await Promise.all([
    all(ctx, "SELECT COUNT(*) AS runs, " +
      "SUM(CASE WHEN status IN ('completed','success','succeeded') THEN 1 ELSE 0 END) AS successes, " +
      "SUM(CASE WHEN status IN ('failed','error','timeout','cancelled') THEN 1 ELSE 0 END) AS failures, " +
      "SUM(CASE WHEN status NOT IN ('completed','success','succeeded','failed','error','timeout','cancelled') THEN 1 ELSE 0 END) AS in_progress, " +
      "COALESCE(SUM(model_call_count),0) AS model_calls, COALESCE(SUM(tool_call_count),0) AS tool_calls, " +
      "COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens, " +
      "COALESCE(SUM(cost_usd),0) AS cost_usd, AVG(latency_ms) AS average_latency_ms, " +
      "MIN(created_at_unix) AS first_run_unix, MAX(updated_at_unix) AS last_run_unix " +
      "FROM agentsam_agent_run WHERE account_id = ? AND created_at_unix >= ?", since),
    all(ctx, "SELECT " + bucket + " AS bucket, COUNT(*) AS runs, " +
      "SUM(CASE WHEN status IN ('completed','success','succeeded') THEN 1 ELSE 0 END) AS successes, " +
      "SUM(CASE WHEN status IN ('failed','error','timeout','cancelled') THEN 1 ELSE 0 END) AS failures " +
      "FROM agentsam_agent_run WHERE account_id = ? AND created_at_unix >= ? " +
      "GROUP BY bucket ORDER BY bucket ASC LIMIT 500", since),
    all(ctx, "SELECT id, mode, surface, status, error_code, latency_ms, created_at_unix " +
      "FROM agentsam_agent_run WHERE account_id = ? AND created_at_unix >= ? " +
      "AND status IN ('failed','error','timeout','cancelled') " +
      "ORDER BY created_at_unix DESC LIMIT 50", since),
  ]);
  const summary = summaryRows[0] || {};
  return {
    schema: "agentsam.agent-runs.v1",
    range,
    scope: "authenticated_account",
    totals: {
      runs: number(summary.runs),
      successes: number(summary.successes),
      failures: number(summary.failures),
      in_progress: number(summary.in_progress),
      model_calls: number(summary.model_calls),
      tool_calls: number(summary.tool_calls),
      input_tokens: number(summary.input_tokens),
      output_tokens: number(summary.output_tokens),
      cost_usd: number(summary.cost_usd),
      average_latency_ms: nullableNumber(summary.average_latency_ms),
      first_run_unix: nullableNumber(summary.first_run_unix),
      last_run_unix: nullableNumber(summary.last_run_unix),
    },
    by_day: dayRows.map((row) => ({
      bucket: String(row.bucket),
      runs: number(row.runs),
      successes: number(row.successes),
      failures: number(row.failures),
    })),
    recent_failures: failureRows.map((row) => ({
      id: String(row.id),
      mode: row.mode == null ? null : String(row.mode),
      surface: row.surface == null ? null : String(row.surface),
      status: String(row.status),
      error_code: row.error_code == null ? "" : String(row.error_code),
      latency_ms: nullableNumber(row.latency_ms),
      created_at_unix: number(row.created_at_unix),
    })),
  };
}

export async function queryAgentSamAnalytics(ctx: AnalyticsQueryContext, section: string, rawRange: unknown) {
  if (!ctx?.db || typeof ctx.db.prepare !== "function") {
    throw new TypeError("analytics DB binding unavailable");
  }

  if (!ctx?.accountId || typeof ctx.accountId !== "string" || !ctx.accountId.trim()) {
    throw Object.assign(new Error("authenticated_account_required"), { status: 401 });
  }
  const range = normalizeAnalyticsRange(rawRange);
  const since = rangeStartUnix(range);

  if (section === "overview") return overview(ctx, range, since);
  if (section === "usage") return usage(ctx, range, since);
  if (section === "performance") return performance(ctx, range, since);
  if (section === "health") return health(ctx, range, since);
  if (section === "scores") return scores(ctx, range, since);

  const error = Object.assign(new Error("analytics_section_not_found"), { status: 404 });
  throw error;
}

export async function handleAnalyticsQueryRequest(request: Request, ctx: AnalyticsQueryContext) {
  if (request.method !== "GET") {
    return {
      status: 405,
      headers: { allow: "GET" },
      body: { ok: false, error: "method_not_allowed" },
    };
  }

  const url = new URL(request.url);
  const section = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const range = url.searchParams.get("range") || "30d";

  try {
    return {
      status: 200,
      body: await queryAgentSamAnalytics(ctx, section, range),
    };
  } catch (error) {
    return {
      status: Number((error as Error & { status?: number })?.status || 500),
      body: {
        ok: false,
        error: String((error as Error)?.message || error).slice(0, 200),
      },
    };
  }
}

export * from "./basin.js";
