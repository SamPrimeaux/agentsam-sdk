import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { queryAgentSamToolUsage } from "../dist/server/index.js";

function d1(sqlite, seen = []) {
  return {
    prepare(sql) {
      seen.push(sql);
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

test("tool usage is read only for the authenticated account and never accepts a query account", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const statements = [];
  sqlite.exec(`CREATE TABLE agentsam_tool_call_log (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL, tool_key TEXT NOT NULL,
    status TEXT NOT NULL, error_code TEXT, failure_origin TEXT,
    duration_ms INTEGER, cost_usd REAL NOT NULL DEFAULT 0, cost_basis TEXT NOT NULL DEFAULT 'unknown',
    created_at_unix INTEGER NOT NULL
  );`);
  const now = Math.floor(Date.now() / 1000);
  const insert = sqlite.prepare(`INSERT INTO agentsam_tool_call_log
    (id,account_id,tool_key,status,error_code,failure_origin,duration_ms,cost_usd,cost_basis,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insert.run("a1", "account_A", "catalog.search", "success", null, null, 120, 0.25, "api_metered", now - 10);
  insert.run("a2", "account_A", "catalog.search", "error", "upstream_timeout", "tool", 400, 0, "unknown", now - 9);
  insert.run("b1", "account_B", "billing.refund", "success", null, null, 50, 9000, "api_metered", now - 8);

  try {
    const receipt = await queryAgentSamToolUsage({ db: d1(sqlite, statements), accountId: "account_A" }, "30d");
    assert.equal(receipt.schema, "agentsam.tool-usage.v2");
    assert.equal(receipt.scope, "authenticated_account");
    assert.equal(receipt.totals.calls, 2);
    assert.equal(receipt.totals.successes, 1);
    assert.equal(receipt.totals.failures, 1);
    assert.equal(receipt.totals.priced_calls, 1);
    assert.equal(receipt.totals.recorded_cost_usd, 0.25);
    assert.deepEqual(receipt.by_tool.map((row) => row.tool_key), ["catalog.search"]);
    assert.equal(receipt.recent_failures[0].error_code, "upstream_timeout");
    assert.ok(statements.filter((sql) => sql.includes("FROM agentsam_tool_call_log")).every((sql) =>
      /WHERE account_id = \? AND created_at_unix >= \?/.test(sql)));
    await assert.rejects(queryAgentSamToolUsage({ db: d1(sqlite), accountId: "" }, "30d"), /authenticated_account_required/);
  } finally {
    sqlite.close();
  }
});
