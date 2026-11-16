import test from "node:test";
import assert from "node:assert/strict";
import {
  queryAgentSamAnalytics,
  handleAnalyticsQueryRequest,
} from "../dist/server/index.js";

function harness() {
  const statements = [];
  const db = {
    prepare(sql) {
      const call = { sql, bindings: null };
      statements.push(call);
      return {
        bind(...args) {
          call.bindings = args;
          return {
            async first() {
              // Account B cannot inherit Account A's operational aggregates.
              return {
                total_events: args[0] === "account_A" ? 7 : 0,
                successful_events: args[0] === "account_A" ? 6 : 0,
                failed_events: args[0] === "account_A" ? 1 : 0,
              };
            },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
  return { db, statements };
}

test("all D1 read models bind the verified account to every query", async () => {
  for (const section of ["overview", "usage", "performance", "health", "scores"]) {
    const { db, statements } = harness();
    await queryAgentSamAnalytics({ db, accountId: "account_A" }, section, "30d");
    assert.ok(statements.length, section + " must run real D1 queries");
    for (const item of statements) {
      assert.match(item.sql, /WHERE account_id = \? AND created_at_unix >= \?/);
      assert.equal(item.bindings[0], "account_A");
      assert.equal(typeof item.bindings[1], "number");
    }
  }
});

test("account isolation and browser account override rejection", async () => {
  const a = harness();
  const b = harness();
  const aModel = await queryAgentSamAnalytics({ db: a.db, accountId: "account_A" }, "overview", "7d");
  const bModel = await queryAgentSamAnalytics({ db: b.db, accountId: "account_B" }, "overview", "7d");
  assert.equal(aModel.summary.total_events, 7);
  assert.equal(bModel.summary.total_events, 0);

  const req = new Request("https://localhost/api/analytics/overview?range=7d&account_id=account_A");
  const result = await handleAnalyticsQueryRequest(req, { db: b.db, accountId: "account_B" });
  assert.equal(result.status, 200);
  assert.equal(result.body.summary.total_events, 0);
  assert.ok(b.statements.every((entry) => entry.bindings[0] === "account_B"));
});

test("anonymous requests fail closed before querying", async () => {
  const { db, statements } = harness();
  const result = await handleAnalyticsQueryRequest(
    new Request("https://localhost/api/analytics/overview"),
    { db, accountId: "" },
  );
  assert.equal(result.status, 401);
  assert.equal(result.body.error, "authenticated_account_required");
  assert.equal(statements.length, 0);
});

test("unrecognized sections cannot execute arbitrary SQL", async () => {
  const { db, statements } = harness();
  const result = await handleAnalyticsQueryRequest(
    new Request("https://localhost/api/analytics/financial?account_id=account_A"),
    { db, accountId: "account_A" },
  );
  assert.equal(result.status, 404);
  assert.equal(statements.length, 0);
});
