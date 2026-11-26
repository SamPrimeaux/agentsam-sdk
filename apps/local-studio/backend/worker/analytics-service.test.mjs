import assert from "node:assert/strict";
import test from "node:test";
import { emitAnalyticsFact } from "./analytics-service.js";

test("analytics D1 and Pipeline emitters stamp account_id from the verified session", async () => {
  const writes = [];
  const batches = [];
  const env = {
    DB: { prepare(sql) { return { bind(...values) { return { async run() { writes.push({ sql, values }); return { meta: { changes: 1 } }; } }; } }; } },
    AGENTSAM_ACTIVITY: { async send(records) { batches.push(records); } },
  };
  const result = await emitAnalyticsFact(env, "au_session", {
    id: "event_test_1",
    account_id: "au_spoofed",
    tenant_id: "au_spoofed",
    event_kind: "tool_call",
    domain: "tools",
    operation: "catalog.search",
    outcome: "success",
    source_client: "test",
    created_at_unix: Math.floor(Date.now() / 1000),
  });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].values[2], "au_session");
  assert.equal(writes[0].values[3], "au_session");
  assert.equal(batches.length, 1);
  assert.equal(batches[0][0].account_id, "au_session");
  assert.equal(batches[0][0].tenant_id, "au_session");
  assert.equal(result.basin.ok, true);
  await assert.rejects(emitAnalyticsFact(env, "", { event_kind: "tool_call", domain: "tools", operation: "x" }), /authenticated_account_required/);
  assert.equal(writes.length, 1);
});


test("analytics facts with a dedup key are idempotent", async () => {
  const stored = new Map();
  let streamCalls = 0;
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...values) {
            if (sql.includes("INSERT OR IGNORE INTO agentsam_analytics")) {
              return {
                async run() {
                  const dedupKey = values[40];
                  if (dedupKey && stored.has(dedupKey)) return { meta: { changes: 0 } };
                  const row = { id: values[0], created_at_unix: values[41] };
                  if (dedupKey) stored.set(dedupKey, row);
                  return { meta: { changes: 1 } };
                },
              };
            }
            if (sql.includes("SELECT id, created_at_unix FROM agentsam_analytics")) {
              return { async first() { return stored.get(values[0]) || null; } };
            }
            throw new Error("unexpected_analytics_sql");
          },
        };
      },
    },
    AGENTSAM_ACTIVITY: { async send() { streamCalls += 1; } },
  };
  const fact = {
    id: "event_timeout_1",
    event_kind: "runtime",
    domain: "agent_run",
    operation: "timeout",
    outcome: "timed_out",
    run_id: "arun_timeout_1",
    dedup_key: "run:arun_timeout_1:timed_out",
  };
  const first = await emitAnalyticsFact(env, "acct_1", fact);
  const second = await emitAnalyticsFact(env, "acct_1", fact);
  assert.equal(first.deduplicated, undefined);
  assert.equal(second.deduplicated, true);
  assert.equal(streamCalls, 1);
});
