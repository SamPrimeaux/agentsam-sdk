import assert from "node:assert/strict";
import test from "node:test";
import { emitAnalyticsFact } from "./analytics-service.js";

test("analytics D1 and Pipeline emitters stamp account_id from the verified session", async () => {
  const writes = [];
  const batches = [];
  const env = {
    DB: { prepare(sql) { return { bind(...values) { return { async run() { writes.push({ sql, values }); } }; } }; } },
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
