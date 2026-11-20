import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { __setApplicationAccountId } from "../backend/lib/account-context.js";
import { rollupToolCallDaily, TOOL_RELIABILITY_ROLLUP } from "../backend/agentsam/compaction.js";

const ACCOUNT = "acct_health_rollup";
const DATE_KEY = "2026-11-19";
const AT = Math.floor(Date.parse(`${DATE_KEY}T12:00:00.000Z`) / 1000);

function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE agentsam_tool_call_log (
      account_id TEXT NOT NULL, created_at INTEGER NOT NULL, tool_key TEXT,
      tool_name TEXT, tool_category TEXT, mcp_server_key TEXT, status TEXT NOT NULL,
      cost_usd REAL NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0, duration_ms REAL NOT NULL DEFAULT 0,
      failure_origin TEXT
    );
    CREATE TABLE agentsam_tool_call_daily (
      id TEXT NOT NULL, account_id TEXT NOT NULL, date_key TEXT NOT NULL,
      tool_key TEXT NOT NULL, tool_name TEXT, tool_category TEXT, mcp_server_key TEXT,
      total_calls INTEGER NOT NULL, success_count INTEGER NOT NULL, failure_count INTEGER NOT NULL,
      success_rate REAL NOT NULL, total_cost_usd REAL NOT NULL, total_tokens INTEGER NOT NULL,
      avg_duration_ms REAL NOT NULL, max_duration_ms REAL NOT NULL, compacted_at INTEGER NOT NULL,
      UNIQUE(account_id,date_key,tool_key)
    );
    CREATE TABLE agentsam_tool_stats_compacted (
      id TEXT NOT NULL, account_id TEXT NOT NULL, tool_key TEXT NOT NULL, tool_name TEXT,
      total_calls INTEGER NOT NULL, success_count INTEGER NOT NULL, failure_count INTEGER NOT NULL,
      success_rate REAL NOT NULL, total_cost_usd REAL NOT NULL, total_tokens INTEGER NOT NULL,
      avg_duration_ms REAL NOT NULL, p95_duration_ms REAL NOT NULL, first_seen_at INTEGER,
      last_seen_at INTEGER, compacted_at INTEGER NOT NULL, UNIQUE(account_id,tool_key)
    );
    CREATE TABLE agentsam_tools (
      id TEXT PRIMARY KEY, account_id TEXT, tool_key TEXT, failure_rate REAL,
      avg_latency_ms REAL, is_degraded INTEGER NOT NULL DEFAULT 0
    );
  `);
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let params = [];
      const bound = {
        bind(...values) { params = values; return bound; },
        async run() {
          const result = statement.run(...params);
          return { success: true, meta: { changes: result.changes } };
        },
        async first() { return statement.get(...params) || null; },
        async all() { return { results: statement.all(...params) }; },
      };
      return bound;
    },
  };
  return { sqlite, DB };
}

function addCalls(sqlite, { accountId = ACCOUNT, toolKey, success = 0, error = 0, blocked = 0, policyErrors = 0, duration = 10 }) {
  const insert = sqlite.prepare(`INSERT INTO agentsam_tool_call_log
    (account_id,created_at,tool_key,tool_name,tool_category,status,duration_ms,failure_origin)
    VALUES (?,?,?,?,?,?,?,?)`);
  for (let i = 0; i < success; i++) insert.run(accountId, AT, toolKey, toolKey, "test", "success", duration, null);
  for (let i = 0; i < error; i++) insert.run(accountId, AT, toolKey, toolKey, "test", "error", duration, "tool");
  for (let i = 0; i < policyErrors; i++) insert.run(accountId, AT, toolKey, toolKey, "test", "error", duration, "policy");
  for (let i = 0; i < blocked; i++) insert.run(accountId, AT, toolKey, toolKey, "test", "blocked", duration, "policy");
}

test("daily tool compaction updates account-scoped reliability with a 30-day, 20-call floor", async () => {
  const { sqlite, DB } = database();
  try {
    sqlite.prepare("INSERT INTO agentsam_tools VALUES (?,?,?,?,?,?)").run("healthy", ACCOUNT, "healthy", 0.8, 999, 1);
    sqlite.prepare("INSERT INTO agentsam_tools VALUES (?,?,?,?,?,?)").run("low", ACCOUNT, "low", 0.4, 999, 1);
    sqlite.prepare("INSERT INTO agentsam_tools VALUES (?,?,?,?,?,?)").run("policy", ACCOUNT, "policy", 0.3, 999, 1);
    sqlite.prepare("INSERT INTO agentsam_tools VALUES (?,?,?,?,?,?)").run("other", "acct_other", "healthy", 0.7, 888, 1);

    addCalls(sqlite, { toolKey: "healthy", success: 18, error: 2, blocked: 3, duration: 10 });
    addCalls(sqlite, { toolKey: "low", success: 19, duration: 20 });
    addCalls(sqlite, { toolKey: "policy", policyErrors: 25, duration: 30 });
    addCalls(sqlite, { accountId: "acct_other", toolKey: "healthy", error: 25, duration: 40 });

    __setApplicationAccountId(ACCOUNT);
    const result = await rollupToolCallDaily({ DB }, DATE_KEY);
    assert.equal(result.ok, true);
    assert.equal(result.health_rows, 1);
    assert.equal(result.health_window_days, 30);
    assert.equal(result.health_minimum_sample_size, 20);
    assert.deepEqual(TOOL_RELIABILITY_ROLLUP, {
      windowDays: 30, minimumSampleSize: 20, degradedFailureRate: 0.05,
    });

    const healthy = sqlite.prepare("SELECT failure_rate,avg_latency_ms,is_degraded FROM agentsam_tools WHERE id='healthy'").get();
    assert.equal(healthy.failure_rate, 0.1, "blocked calls are not in the reliability denominator");
    assert.equal(healthy.avg_latency_ms, 10);
    assert.equal(healthy.is_degraded, 1);

    const low = sqlite.prepare("SELECT failure_rate,avg_latency_ms,is_degraded FROM agentsam_tools WHERE id='low'").get();
    assert.equal(low.failure_rate, 0.4);
    assert.equal(low.avg_latency_ms, 999);
    assert.equal(low.is_degraded, 1, "under-sampled rows are untouched");
    const policy = sqlite.prepare("SELECT failure_rate,avg_latency_ms,is_degraded FROM agentsam_tools WHERE id='policy'").get();
    assert.equal(policy.failure_rate, 0.3);
    assert.equal(policy.avg_latency_ms, 999);
    assert.equal(policy.is_degraded, 1, "policy-origin errors are not tool reliability failures");
    const other = sqlite.prepare("SELECT failure_rate,avg_latency_ms,is_degraded FROM agentsam_tools WHERE id='other'").get();
    assert.equal(other.failure_rate, 0.7);
    assert.equal(other.avg_latency_ms, 888);
    assert.equal(other.is_degraded, 1, "another account's telemetry is not read or written");
  } finally {
    __setApplicationAccountId(null);
    sqlite.close();
  }
});
