import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { queryAccountToolUsage } from "./analytics-tool-usage-v2.js";

test("package-owned tool usage is account-scoped and distinguishes priced from unpriced calls", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE agentsam_tool_call_log (
    id TEXT, account_id TEXT NOT NULL, tool_key TEXT NOT NULL, status TEXT,
    error_code TEXT, failure_origin TEXT, duration_ms INTEGER, cost_usd REAL,
    cost_basis TEXT, created_at_unix INTEGER NOT NULL
  );`);
  const now = Math.floor(Date.now() / 1000);
  const insert = sqlite.prepare(`INSERT INTO agentsam_tool_call_log
    (id,account_id,tool_key,status,error_code,failure_origin,duration_ms,cost_usd,cost_basis,created_at_unix)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  insert.run("a1","acct-1","search","success",null,null,100,0.43,"api_metered",now-10);
  insert.run("a2","acct-1","search","success",null,null,120,null,"unknown",now-9);
  insert.run("b1","acct-2","billing","success",null,null,50,9000,"api_metered",now-9);
  insert.run("old","acct-1","old","success",null,null,50,10,"api_metered",now-60*60*24*40);
  const env = { DB: { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  }; } }; } } };
  try {
    const receipt = await queryAccountToolUsage(env, "acct-1", "30d");
    assert.equal(receipt.schema,"agentsam.tool-usage.v2");
    assert.equal(receipt.scope,"authenticated_account");
    assert.equal(receipt.coverage.measured_calls,1);
    assert.equal(receipt.totals.calls,2);
    assert.equal(receipt.totals.priced_calls,1);
    assert.ok(Math.abs(receipt.totals.recorded_cost_usd-0.43)<0.001);
    assert.equal(receipt.by_tool.length,1);
    assert.equal(receipt.by_tool[0].tool_key,"search");
    await assert.rejects(queryAccountToolUsage(env, "", "30d"),/authenticated_account_required/);
  } finally { sqlite.close(); }
});
