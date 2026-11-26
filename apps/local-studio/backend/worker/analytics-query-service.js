import {
  handleAnalyticsQueryRequest as handlePackageAnalyticsQueryRequest,
  queryAgentSamAnalytics,
  queryAgentSamToolUsage,
  queryAgentSamAgentRuns,
} from "@inneranimalmedia/agentsam-analytics/server";
import { handleSecurityAnalytics } from "./security-analytics.js";
import { buildFinancialAnalyticsReadModel } from "@inneranimalmedia/financial-analytics/server";

const PRIVATE_HEADERS = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie",
};
const asNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const asNullableNumber = (value) => value == null ? null : asNumber(value);

function failureRow(row, domain = row.domain || "unknown", operation = row.operation || "unknown") {
  return {
    domain: String(domain),
    operation: String(operation),
    error_code: row.error_code == null ? null : String(row.error_code),
    status: String(row.status || "failed"),
    occurred_at: asNumber(row.created_at_unix),
  };
}

async function discoverBasinForAccount(env, accountId) {
  const unavailable = {
    enabled: false,
    status: "not_connected",
    source: "Cloudflare Basin API",
    checkedAt: null,
    warehouses: [],
    pipelines: [],
    catalogTables: [],
  };
  try {
    const { discoverBasinResources } = await import("@inneranimalmedia/agentsam-connector-cloudflare/families/basin");
    let client;
    // Test injection only; production always resolves the grant from this account's OAuth row.
    if (env?.__agentsamTestCfClient !== undefined) {
      client = env.__agentsamTestCfClient;
    } else {
      const { createCloudflareApiClient } = await import("@inneranimalmedia/agentsam-connector-cloudflare/api-client");
      client = await createCloudflareApiClient({
        env,
        ownerId: accountId,
        authMode: "oauth",
        capabilityId: "cloudflare.basin.read",
      });
    }
    if (!client?.accountId) {
      return { ...unavailable, enabled: true, status: "permission_required", checkedAt: new Date().toISOString() };
    }
    return { ...unavailable, ...(await discoverBasinResources(client)) };
  } catch (error) {
    const code = String(error?.code || "cloudflare_authorization_required");
    if ([
      "cloudflare_account_selection_required",
      "cloudflare_reconnect_required",
      "cloudflare_authorization_required",
      "cloudflare_permission_denied",
      "cloudflare_permission_required",
    ].includes(code)) {
      return { ...unavailable, enabled: true, status: "permission_required", reason: code };
    }
    return { ...unavailable, reason: code };
  }
}


async function queryCloudflareHttpAnalytics(env, ownerAccountId, rawRange) {
  const unavailable = {
    available: false,
    source: "Cloudflare GraphQL Analytics",
    requests: null,
    errors: null,
    errorRate: null,
    rpm: null,
    byStatus: [],
  };
  const now = Math.floor(Date.now() / 1000);
  const range = String(rawRange || "30d").toLowerCase();
  let windowSeconds;
  if (range === "24h") windowSeconds = 24 * 60 * 60;
  else if (range === "7d") windowSeconds = 7 * 24 * 60 * 60;
  else if (range === "30d") windowSeconds = 30 * 24 * 60 * 60;
  else if (range === "90d") windowSeconds = 90 * 24 * 60 * 60;
  else if (range === "ytd") {
    const date = new Date(now * 1000);
    windowSeconds = now - Math.floor(Date.UTC(date.getUTCFullYear(), 0, 1) / 1000);
  } else windowSeconds = 365 * 24 * 60 * 60;

  // Cloudflare guarantees at least 31 days of adaptive HTTP analytics. Do not
  // silently show a 31-day slice as though it represented a longer selection.
  if (windowSeconds > 31 * 24 * 60 * 60) {
    return { ...unavailable, reason: "cloudflare_analytics_retention_limit", maxDays: 31 };
  }

  try {
    let client;
    if (env?.__agentsamTestCfClient !== undefined) {
      client = env.__agentsamTestCfClient;
    } else {
      const { createCloudflareApiClient } = await import("@inneranimalmedia/agentsam-connector-cloudflare/api-client");
      client = await createCloudflareApiClient({
        env,
        ownerId: ownerAccountId,
        authMode: "oauth",
        capabilityId: "cloudflare.perm.account-analytics",
      });
    }
    if (!client?.accountId) {
      return { ...unavailable, reason: "cloudflare_account_selection_required" };
    }

    const start = now - windowSeconds;
    const startIso = new Date(start * 1000).toISOString();
    const endIso = new Date(now * 1000).toISOString();
    const query = [
      "query AgentSamHttpHealth($accountTag: string, $start: Time, $end: Time) {",
      "  viewer {",
      "    accounts(filter: { accountTag: $accountTag }) {",
      "      requests: httpRequestsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $start, datetime_leq: $end, requestSource: \"eyeball\" }) { count }",
      "      byStatus: httpRequestsAdaptiveGroups(limit: 100, filter: { datetime_geq: $start, datetime_leq: $end, requestSource: \"eyeball\" }) { count dimensions { edgeResponseStatus } }",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const response = await client.request("POST", "https://api.cloudflare.com/client/v4/graphql", {
      body: {
        query,
        variables: { accountTag: client.accountId, start: startIso, end: endIso },
      },
      capabilityId: "cloudflare.perm.account-analytics",
    });
    const graph = response?.raw || response?.result || response;
    if (Array.isArray(graph?.errors) && graph.errors.length) {
      const message = String(graph.errors[0]?.message || "Cloudflare Analytics GraphQL query failed");
      const error = new Error(message);
      error.code = /permission|not authorized|unauthorized|authentication/i.test(message)
        ? "cloudflare_permission_denied"
        : "cloudflare_analytics_query_failed";
      throw error;
    }
    const account = graph?.data?.viewer?.accounts?.[0];
    if (!account) return { ...unavailable, reason: "cloudflare_analytics_no_account_data" };

    const requestGroups = Array.isArray(account.requests) ? account.requests : [];
    const statusGroups = Array.isArray(account.byStatus) ? account.byStatus : [];
    const requests = requestGroups.reduce((sum, row) => sum + asNumber(row.count), 0);
    const byStatus = statusGroups.map((row) => ({
      status: String(row.dimensions?.edgeResponseStatus ?? "unknown"),
      requests: asNumber(row.count),
    })).sort((a, b) => String(a.status).localeCompare(String(b.status), undefined, { numeric: true }));
    const errors = byStatus
      .filter((row) => Number(row.status) >= 500 && Number(row.status) <= 599)
      .reduce((sum, row) => sum + row.requests, 0);
    const minutes = Math.max(1, windowSeconds / 60);

    return {
      available: true,
      source: "Cloudflare GraphQL Analytics",
      requests,
      errors,
      errorRate: requests > 0 ? (errors / requests) * 100 : 0,
      rpm: requests / minutes,
      byStatus,
      windowStart: startIso,
      windowEnd: endIso,
    };
  } catch (error) {
    const code = String(error?.code || "cloudflare_analytics_unavailable");
    return { ...unavailable, reason: code };
  }
}

async function buildHealthDashboard(ctx, env, range) {
  const [overview, performance, health, toolUsage, modelUsage, agentRuns, basin, edge] = await Promise.all([
    queryAgentSamAnalytics(ctx, "overview", range),
    queryAgentSamAnalytics(ctx, "performance", range),
    queryAgentSamAnalytics(ctx, "health", range),
    queryAgentSamToolUsage(ctx, range),
    queryAgentSamAnalytics(ctx, "usage", range),
    queryAgentSamAgentRuns(ctx, range),
    discoverBasinForAccount(env, ctx.accountId),
    queryCloudflareHttpAnalytics(env, ctx.accountId, range),
  ]);

  const eventTotals = health.summary || {};
  const toolTotals = toolUsage.totals || {};
  const runTotals = agentRuns.totals || {};
  const eventCount = asNumber(eventTotals.total_events);
  const toolCallCount = asNumber(toolTotals.calls);
  const runCount = asNumber(runTotals.runs);
  const totalEvents = eventCount + toolCallCount + runCount;
  const totalFailures = asNumber(eventTotals.failed_events)
    + asNumber(toolTotals.failures)
    + asNumber(runTotals.failures);
  const totalSuccesses = asNumber(eventTotals.successful_events)
    + asNumber(toolTotals.successes)
    + asNumber(runTotals.successes);
  const eventDuration = asNullableNumber(eventTotals.average_duration_ms);
  const toolDuration = asNullableNumber(toolTotals.average_duration_ms);
  const runDuration = asNullableNumber(runTotals.average_latency_ms);
  const weightedDuration = totalEvents > 0
    ? (
      (eventDuration || 0) * eventCount
      + (toolDuration || 0) * toolCallCount
      + (runDuration || 0) * runCount
    ) / totalEvents
    : null;

  const timeline = new Map();
  for (const point of overview.timeline || []) {
    timeline.set(String(point.bucket), {
      bucket: String(point.bucket),
      events: asNumber(point.events),
      failures: asNumber(point.failures),
    });
  }
  for (const point of toolUsage.by_day || []) {
    const key = String(point.bucket);
    const current = timeline.get(key) || { bucket: key, events: 0, failures: 0 };
    current.events += asNumber(point.calls);
    current.failures += asNumber(point.failures);
    timeline.set(key, current);
  }
  for (const point of agentRuns.by_day || []) {
    const key = String(point.bucket);
    const current = timeline.get(key) || { bucket: key, events: 0, failures: 0 };
    current.events += asNumber(point.runs);
    current.failures += asNumber(point.failures);
    timeline.set(key, current);
  }

  const eventOperations = (performance.operations || []).map((row) => ({
    domain: String(row.domain || "unknown"),
    operation: String(row.operation || "unknown"),
    samples: asNumber(row.samples),
    failures: asNumber(row.failures),
    duration_ms: asNullableNumber(row.average_duration_ms),
  }));
  const toolOperations = (toolUsage.by_tool || []).map((row) => ({
    domain: "tools",
    operation: String(row.tool_key || "unknown"),
    samples: asNumber(row.calls),
    failures: asNumber(row.failures),
    duration_ms: asNullableNumber(row.average_duration_ms),
  }));
  const runOperations = runCount > 0 ? [{
    domain: "agents",
    operation: "agent.run",
    samples: runCount,
    failures: asNumber(runTotals.failures),
    duration_ms: runDuration,
  }] : [];

  const eventFailures = (health.recent_failures || []).map((row) => failureRow(row));
  const toolFailures = (toolUsage.recent_failures || []).map((row) => failureRow(row, "tools", row.tool_key));
  const runFailures = (agentRuns.recent_failures || []).map((row) =>
    failureRow(row, "agents", row.mode || "agent.run"),
  );
  const failures = [...eventFailures, ...toolFailures, ...runFailures]
    .sort((a, b) => b.occurred_at - a.occurred_at)
    .slice(0, 50);
  const repository = [...eventFailures, ...toolFailures].filter((row) =>
    /repository|github|deployment|release|ci/i.test(String(row.domain) + " " + String(row.operation)),
  );

  const usageHasSamples = (modelUsage.by_provider_model || []).length > 0;
  const modelCost = usageHasSamples
    ? asNumber(modelUsage.totals?.total_cost_usd)
    : eventCount > 0 ? asNumber(eventTotals.total_cost_usd) : null;

  return {
    ok: true,
    range: String(overview.range || range),
    generatedAt: String(health.generated_at || new Date().toISOString()),
    probeIntervalMinutes: null,
    edge,
    app: {
      available: true,
      source: "Account-scoped D1 operation, tool-call, agent-run and model-usage ledgers",
      totals: {
        events: totalEvents,
        failures: totalFailures,
        successes: totalSuccesses,
        costUsd: totalEvents > 0 ? modelCost : null,
        avgDurationMs: weightedDuration,
      },
      timeline: [...timeline.values()].sort((a, b) => a.bucket.localeCompare(b.bucket)),
      operations: [...eventOperations, ...toolOperations, ...runOperations]
        .sort((a, b) => b.samples - a.samples)
        .slice(0, 50),
      failures,
      repository,
      probes: null,
    },
    basin,
    dataAvailability: {
      cloudflare: edge.available,
      operations: true,
      basin: basin.enabled && basin.status === "connected",
    },
  };
}

/**
 * Local Studio host adapter. Account identity is always injected from the
 * authenticated session; request parameters and bridge keys cannot choose it.
 */
export async function handleAnalyticsQueryRequest(request, env, accountId) {
  if (!accountId || typeof accountId !== "string" || !accountId.trim()) {
    return { status: 401, headers: PRIVATE_HEADERS, body: { ok: false, error: "authenticated_account_required" } };
  }
  if (!env?.DB || typeof env.DB.prepare !== "function") {
    return { status: 503, headers: PRIVATE_HEADERS, body: { ok: false, error: "analytics_db_unavailable" } };
  }
  if (new URL(request.url).pathname === "/api/analytics/security") {
    return handleSecurityAnalytics(request, env, accountId);
  }
  if (request.method !== "GET") {
    return { status: 405, headers: { ...PRIVATE_HEADERS, allow: "GET" }, body: { ok: false, error: "method_not_allowed" } };
  }

  const url = new URL(request.url);
  const ctx = { db: env.DB, accountId };
  const range = url.searchParams.get("range") || "30d";

  try {
    if (url.pathname === "/api/analytics/financial") {
      return {
        status: 200,
        headers: PRIVATE_HEADERS,
        body: await buildFinancialAnalyticsReadModel(ctx, range),
      };
    }
    if (url.pathname === "/api/analytics/health") {
      return {
        status: 200,
        headers: PRIVATE_HEADERS,
        body: await buildHealthDashboard(ctx, env, range),
      };
    }
    if (url.pathname === "/api/analytics/logs/recent") {
      const requestedWindow = Number.parseInt(url.searchParams.get("window") || "180", 10);
      const windowMinutes = Number.isFinite(requestedWindow)
        ? Math.max(1, Math.min(1440, requestedWindow))
        : 180;
      const since = Math.floor(Date.now() / 1000) - windowMinutes * 60;
      const result = await env.DB.prepare(
        "SELECT id, tool_key, status, error_code, failure_origin, duration_ms, created_at_unix " +
        "FROM agentsam_tool_call_log WHERE account_id = ? AND created_at_unix >= ? " +
        "ORDER BY created_at_unix DESC LIMIT 240",
      ).bind(accountId, since).all();
      const logs = (result?.results || []).map((row) => {
        const status = String(row.status || "failed");
        const toolKey = String(row.tool_key || "unknown");
        const ok = status === "success";
        return {
          id: String(row.id),
          source: "agentsam",
          service: "AgentSam Tool Runtime",
          timestamp: new Date(asNumber(row.created_at_unix) * 1000).toISOString(),
          severity: ok ? "info" : "error",
          message: toolKey + " " + status,
          requestId: String(row.id),
          rayId: "",
          route: "tool:" + toolKey,
          status: null,
          durationMs: asNullableNumber(row.duration_ms),
          errorCode: row.error_code == null ? "" : String(row.error_code),
          provider: "",
          model: "",
          metadata: {
            status,
            failure_origin: row.failure_origin == null ? "" : String(row.failure_origin),
          },
        };
      });
      return {
        status: 200,
        headers: PRIVATE_HEADERS,
        body: {
          ok: true,
          source: "AgentSam D1 tool-call ledger",
          generatedAt: new Date().toISOString(),
          logs,
        },
      };
    }
    if (url.pathname === "/api/analytics/tool-usage") {
      return {
        status: 200,
        headers: PRIVATE_HEADERS,
        body: await queryAgentSamToolUsage(ctx, range),
      };
    }

    const result = await handlePackageAnalyticsQueryRequest(request, ctx);
    return {
      ...result,
      headers: { ...PRIVATE_HEADERS, ...(result.headers || {}) },
    };
  } catch (error) {
    const status = Number(error?.status || 500);
    return {
      status: status >= 400 && status <= 599 ? status : 500,
      headers: PRIVATE_HEADERS,
      body: { ok: false, error: String(error?.message || error).slice(0, 200) },
    };
  }
}
