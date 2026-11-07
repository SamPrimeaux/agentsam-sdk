import assert from "node:assert/strict";
import test from "node:test";
import { normalizeVerifiedToolUsage } from "../src/contracts/tool-usage.ts";

const receipt = (overrides = {}) => ({
  schema: "agentsam.tool-usage.v2", scope: "authenticated_account",
  source: "agentsam_tool_call_log", range: "30d",
  coverage: { measured_calls: 2 },
  totals: { calls: 2, priced_calls: 1, recorded_cost_usd: 0.43 },
  ...overrides,
});

test("real ledger with only some priced calls exposes partial coverage, never total spend", () => {
  const result = normalizeVerifiedToolUsage(receipt());
  assert.equal(result.length, 2);
  assert.match(result[0].label, /Recorded tool costs/);
  assert.match(result[0].value, /0.43/);
  assert.match(result[0].detail, /1 of 2/);
  assert.match(result[0].detail, /Excludes provider invoices and untracked model costs/);
  assert.equal(result[1].value, "2");
});

test("unpriced and empty ledgers never claim zero billed spend", () => {
  const result = normalizeVerifiedToolUsage(receipt({totals:{
    calls: 2, priced_calls: 0, recorded_cost_usd: 0,
  }}));
  assert.equal(result[0].value, "Not recorded");
  const empty = normalizeVerifiedToolUsage(receipt({
    coverage:{measured_calls:0},totals:{calls:0,priced_calls:0,recorded_cost_usd:0},
  }));
  assert.equal(empty[0].value,"Not recorded");
  assert.match(empty[0].detail,/No tool calls/);
});

test("untrusted non-account, malformed, and cost-coverage-inconsistent responses cannot appear", () => {
  assert.deepEqual(normalizeVerifiedToolUsage(receipt({scope:"platform"})),[]);
  assert.deepEqual(normalizeVerifiedToolUsage(receipt({range:"All"})),[]);
  assert.deepEqual(normalizeVerifiedToolUsage(receipt({totals:{
    calls:2,priced_calls:3,recorded_cost_usd:100,
  }})),[]);
  assert.deepEqual(normalizeVerifiedToolUsage({}),[]);
});
