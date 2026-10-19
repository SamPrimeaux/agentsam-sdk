import test from "node:test";
import assert from "node:assert/strict";
import { executeCoreTool, CORE_EXECUTABLE_TOOL_KEYS } from "../backend/agentsam/core-tools.js";
import { readOnlySql } from "../backend/agentsam/d1-sql.ts";

function fakeDb({ rows = [], firstFails = false, allFails = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, binds: [] };
      calls.push(call);
      return {
        bind(...binds) { call.binds = binds; return this; },
        async all() { if (allFails) throw new Error("no such table: nope"); return { results: rows }; },
        async first() { if (firstFails) throw new Error("db down"); return { 1: 1 }; },
      };
    },
  };
}
const run = (env, key, params) => executeCoreTool(env, { tool_key: key }, params);

test("both tools are executable and the old fnf keys are not", () => {
  assert.ok(CORE_EXECUTABLE_TOOL_KEYS.has("agentsam_ping"));
  assert.ok(CORE_EXECUTABLE_TOOL_KEYS.has("agentsam_d1_query"));
  assert.ok(!CORE_EXECUTABLE_TOOL_KEYS.has("fnf_d1_query"));
  assert.ok(!CORE_EXECUTABLE_TOOL_KEYS.has("fnf_mcp_bridge_status"));
});

test("agentsam_ping reports db and bridge state and never returns the secret", async () => {
  const secret = "s3cr3t-bridge-value";
  const ok = await run({ DB: fakeDb(), AGENTSAM_BRIDGE_KEY: secret }, "agentsam_ping");
  assert.deepEqual(ok, { ok: true, db: "ok", bridge: "configured" });
  assert.ok(!JSON.stringify(ok).includes(secret));
  assert.deepEqual(await run({}, "agentsam_ping"), { ok: false, db: "unbound", bridge: "not_configured" });
  assert.deepEqual(await run({ DB: fakeDb({ firstFails: true }) }, "agentsam_ping"), { ok: false, db: "error", bridge: "not_configured" });
});

const BLOCKED = [
  ["DELETE FROM pages", "select_only"],
  ["UPDATE pages SET title = 'x'", "select_only"],
  ["INSERT INTO pages (id) VALUES (1)", "select_only"],
  ["REPLACE INTO pages (id) VALUES (1)", "select_only"],
  ["PRAGMA writable_schema = 1", "select_only"],
  ["EXPLAIN SELECT 1", "select_only"],
  ["SELECT 1; DROP TABLE pages", "single_statement_only"],
  ["WITH x AS (SELECT 1) DELETE FROM pages", "write_or_admin_sql_blocked"],
  ["WITH x AS (SELECT 1) UPDATE pages SET title = 'x'", "write_or_admin_sql_blocked"],
  ["SELECT 1 /* ' */; DROP TABLE pages; -- '", "single_statement_only"],
  ["SELECT 1 -- ;\n; DROP TABLE pages", "single_statement_only"],
  ["SELECT 'abc", "sql_unterminated_literal"],
  ["", "sql_required"],
];

test("agentsam_d1_query rejects every write, admin and multi-statement form and never touches the db", async () => {
  for (const [sql, error] of BLOCKED) {
    const db = fakeDb();
    assert.deepEqual(await run({ DB: db }, "agentsam_d1_query", { sql }), { ok: false, error }, sql);
    assert.equal(db.calls.length, 0, "db must not be called for: " + sql);
  }
});

const ALLOWED = [
  "SELECT 'delete me; drop table x' AS note, updated_at FROM pages",
  "SELECT replace(title, 'a', 'b') AS t FROM pages",
  "SELECT * FROM pragma_table_info('pages')",
  "WITH t AS (SELECT 1 AS n) SELECT n FROM t",
  "SELECT 1; -- done",
  'SELECT "update" FROM pages',
];

test("legitimate reads pass, including keywords inside literals and quoted identifiers", () => {
  for (const sql of ALLOWED) assert.equal(readOnlySql(sql).ok, true, sql);
});

test("agentsam_d1_query wraps, bounds and binds", async () => {
  const db = fakeDb({ rows: [{ a: 1 }, { a: 2 }, { a: 3 }] });
  const res = await run({ DB: db }, "agentsam_d1_query", {
    sql: "SELECT * FROM pages WHERE slug = ? AND n = ? AND f = ?; -- trailing",
    params: ["a", 1, true],
    limit: 2,
  });
  assert.deepEqual(res, { ok: true, rows: [{ a: 1 }, { a: 2 }], row_count: 2, truncated: true });
  assert.equal(db.calls[0].sql, "SELECT * FROM (\nSELECT * FROM pages WHERE slug = ? AND n = ? AND f = ?\n) LIMIT 3");
  assert.deepEqual(db.calls[0].binds, ["a", 1, 1]);

  const capped = fakeDb();
  await run({ DB: capped }, "agentsam_d1_query", { sql: "SELECT 1", limit: 9999 });
  assert.ok(capped.calls[0].sql.endsWith("LIMIT 201"));
});

test("agentsam_d1_query validates params, binding and surfaces db errors without throwing", async () => {
  const db = fakeDb();
  assert.deepEqual(await run({ DB: db }, "agentsam_d1_query", { sql: "SELECT ?", params: [{ x: 1 }] }), { ok: false, error: "invalid_params" });
  assert.deepEqual(await run({ DB: db }, "agentsam_d1_query", { sql: "SELECT 1", params: new Array(33).fill(1) }), { ok: false, error: "invalid_params" });
  assert.equal(db.calls.length, 0);
  assert.deepEqual(await run({}, "agentsam_d1_query", { sql: "SELECT 1" }), { ok: false, error: "DB_not_bound" });
  const failing = await run({ DB: fakeDb({ allFails: true }) }, "agentsam_d1_query", { sql: "SELECT * FROM nope" });
  assert.equal(failing.ok, false);
  assert.equal(failing.error, "sql_error");
  assert.match(failing.message, /no such table/);
});
