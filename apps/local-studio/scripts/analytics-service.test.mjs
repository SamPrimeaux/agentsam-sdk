import assert from "node:assert/strict";
import test from "node:test";

import {
  emitAnalyticsFact,
  validateAnalyticsFact,
} from "../backend/worker/analytics-service.js";

function fakeEnv({ streamError = null } = {}) {
  const calls = {
    sql: [],
    bindings: [],
    stream: [],
  };

  const env = {
    DB: {
      prepare(sql) {
        calls.sql.push(sql);
        return {
          bind(...bindings) {
            calls.bindings.push(bindings);
            return {
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
    },
    AGENTSAM_ACTIVITY: {
      async send(records) {
        calls.stream.push(records);
        if (streamError) throw streamError;
      },
    },
  };

  return { env, calls };
}

test("writes D1 and projects the same event id to Basin", async () => {
  const { env, calls } = fakeEnv();

  const result = await emitAnalyticsFact(env, {
    id: "aev_test_1",
    event_kind: "runtime",
    domain: "analytics",
    operation: "basin_smoke_test",
    outcome: "passed",
    repository_id: "github:samprimeaux/agentsam-sdk",
    duration_ms: 1,
    attempt_count: 1,
    dimensions: { source: "operator_smoke" },
    metrics: { smoke: true },
  });

  assert.equal(result.id, "aev_test_1");
  assert.equal(result.basin.ok, true);
  assert.equal(calls.bindings.length, 1);
  assert.equal(calls.stream.length, 1);
  assert.equal(calls.stream[0][0].event_id, "aev_test_1");
  assert.equal(calls.stream[0][0].operation, "basin_smoke_test");
  assert.equal(calls.stream[0][0].duration_ms, "1");
});

test("Basin failure does not invalidate the persisted D1 fact", async () => {
  const { env, calls } = fakeEnv({
    streamError: new Error("basin unavailable"),
  });

  const result = await emitAnalyticsFact(env, {
    id: "aev_test_2",
    event_kind: "runtime",
    domain: "analytics",
    operation: "projection_failure_test",
    outcome: "passed",
  });

  assert.equal(calls.bindings.length, 1);
  assert.equal(result.basin.ok, false);
  assert.match(result.basin.error, /basin unavailable/);
});

test("forbids bulky prompt/receipt/blob payloads", () => {
  assert.throws(
    () =>
      validateAnalyticsFact({
        event_kind: "runtime",
        domain: "analytics",
        operation: "bad_payload",
        dimensions: { prompt: "do not store me" },
      }),
    /not allowed in analytics/,
  );

  assert.throws(
    () =>
      validateAnalyticsFact({
        event_kind: "runtime",
        domain: "analytics",
        operation: "bad_payload",
        metrics: { nested: { full_receipt: { huge: true } } },
      }),
    /not allowed in analytics/,
  );
});
