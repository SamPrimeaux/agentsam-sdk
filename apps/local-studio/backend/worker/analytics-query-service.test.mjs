import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { handleAnalyticsQueryRequest } from "./analytics-query-service.js";

function d1(sqlite) {
  return {
    prepare(sql) {
      return {
        all() { return { results: sqlite.prepare(sql).all() }; },
        bind(...values) {
          return {
            async first() { return sqlite.prepare(sql).get(...values) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
          };
        },
      };
    },
  };
}

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE agentsam_analytics (
      id TEXT PRIMARY KEY, schema_name TEXT, account_id TEXT, tenant_id TEXT,
      workspace_id TEXT, repository_id TEXT, git_sha TEXT, run_id TEXT, receipt_id TEXT,
      event_kind TEXT, domain TEXT, operation TEXT, outcome TEXT,
      source_client TEXT, source_table TEXT, source_id TEXT, provider TEXT, model_key TEXT, tool_key TEXT,
      duration_ms INTEGER, queue_wait_ms INTEGER, external_wait_ms INTEGER, active_model_ms INTEGER,
      input_tokens INTEGER, cached_input_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
      cost_usd REAL DEFAULT 0, cost_basis TEXT, attempt_count INTEGER DEFAULT 1, retry_count INTEGER DEFAULT 0,
      plan_points REAL, score_family TEXT, score_value REAL, weights_version TEXT,
      error_code TEXT, failure_origin TEXT, artifact_ref TEXT, dimensions_json TEXT, metrics_json TEXT,
      dedup_key TEXT, created_at_unix INTEGER NOT NULL
    );
    CREATE TABLE agentsam_tool_call_log (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tool_key TEXT NOT NULL,
      status TEXT NOT NULL, error_code TEXT NOT NULL DEFAULT '', failure_origin TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0,
      cost_basis TEXT NOT NULL DEFAULT 'unknown', created_at_unix INTEGER NOT NULL
    );
    CREATE TABLE agentsam_usage_events (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider TEXT NOT NULL, model_key TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0, cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0, created_at_unix INTEGER NOT NULL
    );
    CREATE TABLE agentsam_agent_run (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, mode TEXT NOT NULL, surface TEXT,
      status TEXT NOT NULL, error_code TEXT, model_call_count INTEGER NOT NULL DEFAULT 0,
      tool_call_count INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0,
      created_at_unix INTEGER NOT NULL, updated_at_unix INTEGER NOT NULL, latency_ms INTEGER
    );
    CREATE TABLE orders (id TEXT PRIMARY KEY, account_id TEXT, status TEXT, total_cents INTEGER, created_at TEXT);
    CREATE TABLE finance_transactions (id TEXT PRIMARY KEY, account_id TEXT, date TEXT, amount_cents INTEGER, direction TEXT, is_business INTEGER DEFAULT 0);
  `);
  const now = Math.floor(Date.now() / 1000);
  const iso = new Date(now * 1000 - 60_000).toISOString();
  sqlite.prepare(`INSERT INTO agentsam_analytics
    (id,schema_name,account_id,tenant_id,event_kind,domain,operation,outcome,duration_ms,cost_usd,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run("event-a", "agentsam.metric-event.v1", "account_A", "account_A", "operation", "commerce", "order.sync", "success", 80, 0.01, now - 10);
  sqlite.prepare(`INSERT INTO agentsam_analytics
    (id,schema_name,account_id,tenant_id,event_kind,domain,operation,outcome,duration_ms,cost_usd,error_code,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run("event-b", "agentsam.metric-event.v1", "account_B", "account_B", "operation", "commerce", "order.delete", "failed", 900, 99, "should_not_leak", now - 9);
  sqlite.prepare(`INSERT INTO agentsam_tool_call_log
    (id,account_id,tool_key,status,error_code,failure_origin,duration_ms,cost_usd,cost_basis,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run("tool-a", "account_A", "catalog.search", "success", "", null, 120, 0.25, "api_metered", now - 8);
  sqlite.prepare(`INSERT INTO agentsam_tool_call_log
    (id,account_id,tool_key,status,error_code,failure_origin,duration_ms,cost_usd,cost_basis,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run("tool-b", "account_B", "billing.refund", "error", "should_not_leak", "tool", 900, 9000, "api_metered", now - 7);
  sqlite.prepare(`INSERT INTO agentsam_usage_events
    (id,account_id,provider,model_key,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,cost_usd,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run("usage-a", "account_A", "openai", "gpt-test", 100, 20, 40, 10, 0.005, now - 6);
  sqlite.prepare(`INSERT INTO agentsam_usage_events
    (id,account_id,provider,model_key,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,cost_usd,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run("usage-b", "account_B", "other", "private-model", 9000, 0, 9000, 0, 9000, now - 5);
  sqlite.prepare(`INSERT INTO agentsam_agent_run
    (id,account_id,mode,surface,status,error_code,model_call_count,tool_call_count,input_tokens,output_tokens,cost_usd,created_at_unix,updated_at_unix,latency_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("run-a", "account_A", "work", "chat", "completed", null, 1, 1, 100, 40, 0.005, now - 4, now - 3, 250);
  sqlite.prepare(`INSERT INTO agentsam_agent_run
    (id,account_id,mode,surface,status,error_code,model_call_count,tool_call_count,input_tokens,output_tokens,cost_usd,created_at_unix,updated_at_unix,latency_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("run-b", "account_B", "work", "chat", "failed", "should_not_leak", 1, 0, 9000, 0, 9000, now - 2, now - 1, 900);
  sqlite.prepare("INSERT INTO orders (id,account_id,status,total_cents,created_at) VALUES (?,?,?,?,?)").run("order-a", "account_A", "paid", 10000, iso);
  sqlite.prepare("INSERT INTO orders (id,account_id,status,total_cents,created_at) VALUES (?,?,?,?,?)").run("order-b", "account_B", "paid", 900000, iso);
  sqlite.prepare("INSERT INTO finance_transactions (id,account_id,date,amount_cents,direction,is_business) VALUES (?,?,?,?,?,?)").run("finance-a", "account_A", iso, 5000, "credit", 1);
  sqlite.prepare("INSERT INTO finance_transactions (id,account_id,date,amount_cents,direction,is_business) VALUES (?,?,?,?,?,?)").run("personal-a", "account_A", iso, 999999, "credit", 0);
  sqlite.prepare("INSERT INTO finance_transactions (id,account_id,date,amount_cents,direction,is_business) VALUES (?,?,?,?,?,?)").run("finance-b", "account_B", iso, 900000, "credit", 1);
  return { sqlite, env: { DB: d1(sqlite) } };
}

test("Local Studio analytics routes are login-first and account-scoped across D1, finance and tool usage", async () => {
  const { sqlite, env } = fixture();
  try {
    let graphCalls = 0;
    env.__agentsamTestCfClient = {
      accountId: "cf-account-real",
      async request(method, path, options = {}) {
        if (method === "POST" && path.endsWith("/graphql")) {
          graphCalls += 1;
          assert.equal(options.body.variables.accountTag, "cf-account-real");
          return {
            raw: {
              data: {
                viewer: {
                  accounts: [{
                    requests: [{ count: 190 }, { count: 10 }],
                    byStatus: [
                      { count: 190, dimensions: { edgeResponseStatus: 200 } },
                      { count: 10, dimensions: { edgeResponseStatus: 500 } },
                    ],
                  }],
                },
              },
            },
          };
        }
        assert.equal(method, "GET");
        if (path.endsWith("/basin-catalog")) return { result: { warehouses: [{ id: "warehouse-1", name: "agentsam-analytics" }] } };
        if (path.endsWith("/pipelines/v1/pipelines")) return { result: [{ id: "pipeline-1", name: "agentsam-activity", status: "running" }] };
        throw new Error("unexpected_cloudflare_path");
      },
    };
    const health = await handleAnalyticsQueryRequest(new Request("https://localhost/api/analytics/health?range=30d&account_id=account_B"), env, "account_A");
    assert.equal(health.status, 200);
    assert.equal(health.body.app.available, true);
    assert.equal(health.body.app.totals.events, 3);
    assert.equal(health.body.app.totals.successes, 3);
    assert.equal(health.body.app.totals.failures, 0);
    assert.equal(health.body.app.totals.costUsd, 0.005);
    assert.ok(health.body.app.operations.some((row) => row.operation === "catalog.search"));
    assert.ok(health.body.app.operations.some((row) => row.operation === "agent.run"));
    assert.ok(!health.body.app.failures.some((row) => row.error_code === "should_not_leak"));
    assert.equal(health.body.edge.available, true);
    assert.equal(health.body.edge.requests, 200);
    assert.equal(health.body.edge.errors, 10);
    assert.equal(health.body.edge.errorRate, 5);
    assert.equal(health.body.edge.byStatus.length, 2);
    assert.equal(graphCalls, 1);
    const longRange = await handleAnalyticsQueryRequest(new Request("https://localhost/api/analytics/health?range=90d"), env, "account_A");
    assert.equal(longRange.body.edge.available, false);
    assert.equal(longRange.body.edge.reason, "cloudflare_analytics_retention_limit");
    assert.equal(graphCalls, 1);
    assert.equal(health.body.basin.enabled, true);
    assert.equal(health.body.basin.status, "connected");
    assert.equal(health.body.basin.warehouses[0].id, "warehouse-1");
    assert.equal(health.body.basin.pipelines[0].id, "pipeline-1");
    assert.equal(health.body.dataAvailability.basin, true);

    const finance = await handleAnalyticsQueryRequest(new Request("https://localhost/api/analytics/financial?range=30d&account_id=account_B"), env, "account_A");
    assert.equal(finance.status, 200);
    assert.equal(finance.body.metrics.find((row) => row.id === "revenue").value, 100);
    assert.equal(finance.body.metrics.find((row) => row.id === "income").value, 50);
    assert.equal(finance.body.metrics.find((row) => row.id === "tracked_usage_cost").value, 0.25);

    const anonymous = await handleAnalyticsQueryRequest(new Request("https://localhost/api/analytics/financial"), env, null);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.error, "authenticated_account_required");
    const logs = await handleAnalyticsQueryRequest(new Request("https://localhost/api/analytics/logs/recent?window=180"), env, "account_A");
    assert.equal(logs.status, 200);
    assert.equal(logs.body.source, "AgentSam D1 tool-call ledger");
    assert.ok(logs.body.logs.some((row) => row.route === "tool:catalog.search"));
    assert.ok(!logs.body.logs.some((row) => row.errorCode === "should_not_leak"));
  } finally {
    sqlite.close();
  }
});
