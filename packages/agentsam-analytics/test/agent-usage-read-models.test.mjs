import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { queryAgentSamAnalytics, queryAgentSamAgentRuns } from "../dist/server/index.js";

function d1(sqlite, statements = []) {
  return {
    prepare(sql) {
      statements.push(sql);
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

test("model usage reads the canonical account-scoped usage ledger", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const statements = [];
  sqlite.exec(`CREATE TABLE agentsam_usage_events (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, provider TEXT NOT NULL, model_key TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0, cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0, created_at_unix INTEGER NOT NULL
  );`);
  const now = Math.floor(Date.now() / 1000);
  const insert = sqlite.prepare(`INSERT INTO agentsam_usage_events
    (id,account_id,provider,model_key,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,cost_usd,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insert.run("usage-a", "account_A", "openai", "gpt-test", 100, 20, 40, 10, 0.005, now - 10);
  insert.run("usage-b", "account_B", "other", "private-model", 9000, 0, 9000, 0, 9000, now - 9);

  try {
    const result = await queryAgentSamAnalytics({ db: d1(sqlite, statements), accountId: "account_A" }, "usage", "30d");
    assert.equal(result.totals.input_tokens, 100);
    assert.equal(result.totals.cached_input_tokens, 20);
    assert.equal(result.totals.output_tokens, 40);
    assert.equal(result.totals.reasoning_tokens, 10);
    assert.equal(result.totals.total_cost_usd, 0.005);
    assert.deepEqual(result.by_provider_model.map((row) => row.model_key), ["gpt-test"]);
    assert.ok(statements.every((sql) => /FROM agentsam_usage_events WHERE account_id = \? AND created_at_unix >= \?/.test(sql)));
    await assert.rejects(queryAgentSamAnalytics({ db: d1(sqlite), accountId: "" }, "usage", "30d"), /authenticated_account_required/);
  } finally {
    sqlite.close();
  }
});

test("agent-run read model scopes totals, timelines and failures to the authenticated account", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const statements = [];
  sqlite.exec(`CREATE TABLE agentsam_agent_run (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, mode TEXT NOT NULL, surface TEXT,
    status TEXT NOT NULL, error_code TEXT, model_call_count INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0, cost_usd REAL NOT NULL DEFAULT 0,
    created_at_unix INTEGER NOT NULL, updated_at_unix INTEGER NOT NULL, latency_ms INTEGER
  );`);
  const now = Math.floor(Date.now() / 1000);
  const insert = sqlite.prepare(`INSERT INTO agentsam_agent_run
    (id,account_id,mode,surface,status,error_code,model_call_count,tool_call_count,input_tokens,output_tokens,cost_usd,created_at_unix,updated_at_unix,latency_ms)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  insert.run("run-a", "account_A", "work", "chat", "completed", null, 1, 1, 100, 40, 0.005, now - 10, now - 9, 250);
  insert.run("run-fail-a", "account_A", "chat", "chat", "failed", "provider_timeout", 1, 0, 0, 0, 0, now - 8, now - 7, 900);
  insert.run("run-b", "account_B", "work", "chat", "failed", "should_not_leak", 1, 0, 9000, 0, 9000, now - 6, now - 5, 900);

  try {
    const result = await queryAgentSamAgentRuns({ db: d1(sqlite, statements), accountId: "account_A" }, "30d");
    assert.equal(result.schema, "agentsam.agent-runs.v1");
    assert.equal(result.scope, "authenticated_account");
    assert.equal(result.totals.runs, 2);
    assert.equal(result.totals.successes, 1);
    assert.equal(result.totals.failures, 1);
    assert.equal(result.totals.model_calls, 2);
    assert.equal(result.recent_failures.length, 1);
    assert.equal(result.recent_failures[0].error_code, "provider_timeout");
    assert.ok(statements.every((sql) => /FROM agentsam_agent_run WHERE account_id = \? AND created_at_unix >= \?/.test(sql)));
    await assert.rejects(queryAgentSamAgentRuns({ db: d1(sqlite), accountId: "" }, "30d"), /authenticated_account_required/);
  } finally {
    sqlite.close();
  }
});
