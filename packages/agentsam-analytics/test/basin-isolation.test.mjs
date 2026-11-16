import test from "node:test";
import assert from "node:assert/strict";
import { queryScopedBasinActivity } from "../dist/server/index.js";

test("Basin query is fixed, scoped and read-only", async () => {
  let statement;
  const result = await queryScopedBasinActivity({
    accountId: "au_customer2", namespace: "agentsam_runtime", table: "events_v1",
    sinceUnixMs: 123000,
    execute: async (sql) => { statement = sql; return { results: [] }; },
  });
  assert.deepEqual(result, { results: [] });
  assert.match(statement, /^SELECT /);
  assert.match(statement, /WHERE account_id = 'au_customer2' AND occurred_at >= 123000/);
  assert.doesNotMatch(statement, /INSERT|UPDATE|DELETE|DROP/i);
});

test("Basin refuses spoofed identities, table names and missing credential executors", async () => {
  let called = false;
  const defaults = {
    accountId: "au_customer2", namespace: "agentsam_runtime", table: "events_v1", sinceUnixMs: 0,
    execute: async () => { called = true; },
  };
  await assert.rejects(() => queryScopedBasinActivity({ ...defaults, accountId: "x' OR 1=1 --" }), /authenticated_account_required/);
  await assert.rejects(() => queryScopedBasinActivity({ ...defaults, table: "events_v1;DROP TABLE x" }), /invalid_basin_table_identifier/);
  await assert.rejects(() => queryScopedBasinActivity({ ...defaults, execute: undefined }), /basin_account_credential_required/);
  assert.equal(called, false);
});
