import test from "node:test";
import assert from "node:assert/strict";
import { listD1Resources, manageD1Resource } from "../src/runtime/d1-management.js";
import { readD1AccountMetrics, readD1Metrics } from "../src/metrics/d1.js";
import { createDatabaseRequestHandler } from "../src/runtime/request-handler.js";
import { createSqliteAdapter } from "../src/adapters/sqlite.js";
import { readTableRows } from "../src/runtime/rows.js";
import { buildDdlSql } from "../src/runtime/ddl.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const accountId = "a".repeat(32), databaseId = "12345678-abcd-abcd-abcd-123456789abc";
const source = { id: "cf-d1:" + accountId + ":" + databaseId, database_id: databaseId, account_id: accountId, label: "Acceptance" };
const reply = result => new Response(JSON.stringify({ success: true, result }));
test("D1 inventory traverses every result page", async () => {
  const pages = [];
  const result = await listD1Resources({ token: "test", accountId, fetchImpl: async url => {
    const page = Number(new URL(url).searchParams.get("page")); pages.push(page);
    return new Response(JSON.stringify({ success: true, result: [{ uuid: String(page) }], result_info: { total_pages: 3 } }));
  } });
  assert.deepEqual(pages, [1,2,3]); assert.equal(result.length, 3);
});
test("resource mutations require grant, account match, and exact destructive confirmation", async () => {
  let requests = 0;
  const base = { token: "test", accountId, source, fetchImpl: async () => { requests++; return reply({}); } };
  await assert.rejects(manageD1Resource({ ...base, action: "delete", writable: false }), /write_permission/);
  await assert.rejects(manageD1Resource({ ...base, action: "delete", writable: true, input: { confirm_name: "Other", destructive_confirmed: true } }), /exact_database_name/);
  await assert.rejects(manageD1Resource({ ...base, action: "details", source: { ...source, account_id: "b".repeat(32) } }), /resource_identity/);
  assert.equal(requests, 0);
  await manageD1Resource({ ...base, action: "delete", writable: true, input: { confirm_name: source.label, destructive_confirmed: true } });
  assert.equal(requests, 1);
});
test("Time Travel uses query parameters and returns the provider recovery receipt", async () => {
  let called;
  const result = await manageD1Resource({ token: "test", accountId, source, writable: true, action: "restore", input: { bookmark: "bookmark-1", confirm_name: source.label, destructive_confirmed: true }, fetchImpl: async (url, init) => { called = { url, init }; return reply({ previous_bookmark: "before" }); } });
  assert.equal(called.init.method, "POST"); assert.equal(new URL(called.url).searchParams.get("bookmark"), "bookmark-1"); assert.equal(result.previous_bookmark, "before");
});
test("account analytics keep totals independent of per-database group limits and report exact dates", async () => {
  let variables;
  const result = await readD1AccountMetrics({ token: "test", accountId, range: "1h", fetchImpl: async (_, init) => {
    variables = JSON.parse(init.body).variables;
    return new Response(JSON.stringify({ data: { viewer: { accounts: [{ totals: [{ sum: { readQueries: 10, writeQueries: 3, rowsRead: 1234, rowsWritten: 5 } }], databases: [{ dimensions: { databaseId }, sum: { readQueries: 2 } }] }] } } }));
  } });
  assert.equal(result.totals.queries, 13); assert.equal(result.totals.rowsRead, 1234); assert.equal(result.databases[0].queries, 2);
  assert.equal(new Date(variables.end) - new Date(variables.start), 3600000);
  await assert.rejects(readD1AccountMetrics({ token: "test", accountId, fetchImpl: async () => new Response(JSON.stringify({ errors: [{ message: "permission denied" }] })) }), /permission denied/);
});
test("failed hourly analytics never silently widen to daily totals", async () => {
  let calls = 0;
  await assert.rejects(readD1Metrics({ token: "test", accountId, databaseId, range: "1h", fetchImpl: async () => { calls++; return new Response(JSON.stringify({ errors: [{ message: "forbidden" }] })); } }), /forbidden/);
  assert.equal(calls, 1);
});
test("SQLite GUI rows filter and sort with bound values, and refuse updates without a stable key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "db-editor-acceptance-"));
  const adapter = createSqliteAdapter({ path: join(dir,"test.sqlite") });
  try {
    await adapter.query({ sql: "CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT)" });
    await adapter.insert({ table: "notes", values: { id: 1, body: "second" } });
    await adapter.insert({ table: "notes", values: { id: 2, body: "first" } });
    const rows = await readTableRows(adapter, { engine: "sqlite" }, new URLSearchParams({ table: "notes", filter: "first", sort: "id", dir: "desc" }));
    assert.equal(rows.total, 1); assert.equal(rows.rows[0].id, 2);
    const empty = await readTableRows(adapter, { engine: "sqlite" }, new URLSearchParams({ table: "notes", filter: "' OR 1=1 --" }));
    assert.equal(empty.total, 0);
    const schema = await adapter.describeTable({ name: "notes" }); assert.match(schema.createSql, /CREATE TABLE/);
    const handler = createDatabaseRequestHandler({ listSources: async () => ({ sources: [] }), resolveSource: async () => ({ source: { id: "test", writable: true, engine: "sqlite" }, adapter }) });
    const response = await handler.handle(new Request("https://test/api/database/rows", { method: "PATCH", body: JSON.stringify({ source_id: "test", table: "notes", values: { body: "unsafe" }, where: { body: "first" } }) }), { accountId: "owner" });
    assert.equal((await response.json()).error, "stable_row_identity_required");
    assert.equal((await adapter.query({ sql: "SELECT body FROM notes WHERE id=2" })).objects[0].body, "first");
    assert.throws(() => buildDdlSql({ action: "alter_table_add_column", table_name: "notes", column: { name: "bad", type: "TEXT); DROP TABLE notes; --" } }), /Unsupported column type/);
  } finally { adapter.close(); rmSync(dir, { recursive: true, force: true }); }
});
