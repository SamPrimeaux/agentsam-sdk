import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { executeCoreTool } from "../backend/agentsam/core-tools.js";
import { checkSql } from "../backend/agentsam/d1-sql.ts";

// Real SQLite engine behind a D1-shaped adapter, so these tests exercise real SQL, not mocks.
const SECRET = "d1-confirm-test-secret";
const OWNER = { user: { id: "owner-1" } };

function d1(db) {
  return {
    prepare(sql) {
      const st = db.prepare(sql);
      let binds = [];
      const api = {
        bind(...b) { binds = b; return api; },
        async all() {
          const results = st.all(...binds).map((row) => ({ ...row }));
          const meta = db.prepare("SELECT changes() AS changes, last_insert_rowid() AS last_row_id").get();
          return { results, meta: { changes: Number(meta.changes), last_row_id: Number(meta.last_row_id) } };
        },
        async first() { const row = st.get(...binds); return row ? { ...row } : null; },
      };
      return api;
    },
  };
}

function store() {
  const db = new DatabaseSync(":memory:");
  db.exec([
    "CREATE TABLE products (id INTEGER PRIMARY KEY, title TEXT NOT NULL, category TEXT, price REAL)",
    "CREATE TABLE pages (id INTEGER PRIMARY KEY, slug TEXT UNIQUE, title TEXT)",
    "CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT)",
    "CREATE TABLE agentsam_tools (id TEXT PRIMARY KEY, tool_key TEXT, requires_approval INTEGER)",
    "CREATE TABLE accounts (id TEXT PRIMARY KEY)",
    "INSERT INTO products (title, category, price) VALUES ('Tee A','tees',20),('Tee B','tees',22),('Hat','hats',15)",
    "INSERT INTO auth_sessions VALUES ('s1','u1')",
    "INSERT INTO agentsam_tools VALUES ('t1','agentsam_ping',0)",
  ].join(";\n"));
  return { db, env: { DB: d1(db), AGENTSAM_BRIDGE_KEY: SECRET } };
}
const count = (db, table, where = "1=1") => db.prepare("SELECT count(*) AS n FROM " + table + " WHERE " + where).get().n;
const call = (env, key, params, opts = OWNER) => executeCoreTool(env, { tool_key: key }, params, opts);
async function confirmed(env, key, params, opts = OWNER) {
  const preview = await call(env, key, params, opts);
  assert.equal(preview.confirmation_required, true, JSON.stringify(preview));
  return { preview, result: await call(env, key, { ...params, confirm: preview.confirm }, opts) };
}

test("insert previews first, changes nothing, then runs on the matching code", async () => {
  const { db, env } = store();
  const p = { sql: "INSERT INTO products (title, category, price) VALUES (?, ?, ?)", params: ["Mug", "gear", 12] };
  const pre = await call(env, "agentsam_d1_write", p);
  assert.equal(pre.ok, false);
  assert.equal(pre.confirmation_required, true);
  assert.equal(pre.preview.operation, "insert");
  assert.equal(pre.preview.table, "products");
  assert.equal(pre.preview.rows_affected, null);
  assert.match(pre.message, /NOT EXECUTED/);
  assert.equal(count(db, "products"), 3);
  const done = await call(env, "agentsam_d1_write", { ...p, confirm: pre.confirm });
  assert.equal(done.ok, true);
  assert.equal(done.changes, 1);
  assert.equal(count(db, "products"), 4);
});

test("a code unlocks only the exact statement, params and user it was issued for", async () => {
  const { db, env } = store();
  const a = { sql: "INSERT INTO products (title) VALUES (?)", params: ["A"] };
  const code = (await call(env, "agentsam_d1_write", a)).confirm;
  for (const attempt of [
    call(env, "agentsam_d1_write", { sql: a.sql, params: ["B"], confirm: code }),
    call(env, "agentsam_d1_write", { sql: "INSERT INTO products (title) VALUES (?), (?)", params: ["A", "A"], confirm: code }),
    call(env, "agentsam_d1_write", { ...a, confirm: code }, { user: { id: "someone-else" } }),
    call(env, "agentsam_d1_write", { ...a, confirm: "deadbeef" }),
    call(env, "agentsam_d1_write", { ...a, confirm: "" }),
  ]) {
    const res = await attempt;
    assert.equal(res.ok, false);
    assert.equal(res.confirmation_required, true);
  }
  assert.equal(count(db, "products"), 3);
  assert.equal((await call(env, "agentsam_d1_write", { ...a, confirm: code })).ok, true);
});

test("codes expire", async () => {
  const { db, env } = store();
  const a = { sql: "INSERT INTO products (title) VALUES (?)", params: ["A"] };
  const realNow = Date.now;
  const t0 = 1_800_000_000_000;
  try {
    Date.now = () => t0;
    const code = (await call(env, "agentsam_d1_write", a)).confirm;
    Date.now = () => t0 + 5 * 60 * 1000;
    assert.equal((await call(env, "agentsam_d1_write", { ...a, confirm: code })).ok, true);
    Date.now = () => t0 + 25 * 60 * 1000;
    const late = await call(env, "agentsam_d1_write", { ...a, confirm: code });
    assert.equal(late.confirmation_required, true);
  } finally {
    Date.now = realNow;
  }
  assert.equal(count(db, "products"), 4);
});

test("update counts only the WHERE rows (params split correctly), then changes them", async () => {
  const { db, env } = store();
  const p = { sql: "UPDATE products SET price = ?, title = title || ? WHERE category = ?", params: [30, "!", "tees"] };
  const { preview, result } = await confirmed(env, "agentsam_d1_write", p);
  assert.equal(preview.preview.rows_affected, 2);
  assert.equal(result.ok, true);
  assert.equal(result.changes, 2);
  assert.equal(count(db, "products", "price = 30 AND title LIKE '%!'"), 2);
  assert.equal(db.prepare("SELECT price FROM products WHERE title = 'Hat'").get().price, 15);
});

test("delete previews the exact row count, then deletes only those rows", async () => {
  const { db, env } = store();
  const p = { sql: "DELETE FROM products WHERE category = ?", params: ["tees"] };
  const { preview, result } = await confirmed(env, "agentsam_d1_delete", p);
  assert.equal(preview.preview.rows_affected, 2);
  assert.equal(result.changes, 2);
  assert.equal(count(db, "products"), 1);
});

test("UPDATE and DELETE without a top-level WHERE are refused; a WHERE inside a subquery does not count", async () => {
  const { db, env } = store();
  assert.equal((await call(env, "agentsam_d1_write", { sql: "UPDATE products SET price = 0" })).error, "where_required");
  assert.equal((await call(env, "agentsam_d1_write", { sql: "UPDATE products SET price = (SELECT 1 WHERE 1 = 1)" })).error, "where_required");
  assert.equal((await call(env, "agentsam_d1_delete", { sql: "DELETE FROM products" })).error, "where_required");
  assert.equal(count(db, "products"), 3);
});

test("bulk guard: large deletes need an explicit max_rows, and the code is bound to it", async () => {
  const { db, env } = store();
  db.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 150) INSERT INTO products (title, category) SELECT 'b' || i, 'bulk' FROM n");
  const sql = "DELETE FROM products WHERE category = 'bulk'";
  const blocked = await call(env, "agentsam_d1_delete", { sql });
  assert.equal(blocked.error, "too_many_rows");
  assert.equal(blocked.would_affect, 150);
  const pre = await call(env, "agentsam_d1_delete", { sql, max_rows: 200 });
  assert.equal(pre.preview.rows_affected, 150);
  const swapped = await call(env, "agentsam_d1_delete", { sql, max_rows: 500, confirm: pre.confirm });
  assert.equal(swapped.confirmation_required, true);
  const done = await call(env, "agentsam_d1_delete", { sql, max_rows: 200, confirm: pre.confirm });
  assert.equal(done.changes, 150);
  assert.equal(count(db, "products"), 3);
});

test("credential, session and managed tables are protected however they are referenced", async () => {
  const { db, env } = store();
  const write = (sql) => call(env, "agentsam_d1_write", { sql });
  const del = (sql) => call(env, "agentsam_d1_delete", { sql });
  const query = (sql) => call(env, "agentsam_d1_query", { sql });
  for (const res of [
    await write("UPDATE agentsam_tools SET requires_approval = 0 WHERE id = 't1'"),
    await write("INSERT INTO accounts (id) VALUES ('x')"),
    await del("DELETE FROM auth_sessions WHERE id = 's1'"),
    await del("DELETE FROM products WHERE id IN (SELECT id FROM auth_sessions)"),
    await write('INSERT INTO "auth_sessions" (id) VALUES (\'x\')'),
    await write("INSERT INTO main.auth_sessions (id) VALUES ('x')"),
    await query("SELECT * FROM auth_sessions"),
    await query('SELECT * FROM "Auth_Sessions"'),
    await query("SELECT * FROM products p, auth_sessions s"),
    await query("SELECT * FROM products JOIN auth_sessions ON 1 = 1"),
  ]) {
    assert.equal(res.ok, false);
    assert.equal(res.error, "protected_table");
    assert.ok(res.message);
  }
  assert.equal((await query("SELECT tool_key FROM agentsam_tools")).ok, true, "managed tables stay readable");
  assert.equal(count(db, "auth_sessions"), 1);
  assert.equal(db.prepare("SELECT requires_approval AS r FROM agentsam_tools").get().r, 0);
});

test("each tool does only its own job, and DDL or multiple statements never get through", async () => {
  const { db, env } = store();
  const w = (sql) => call(env, "agentsam_d1_write", { sql });
  const d = (sql) => call(env, "agentsam_d1_delete", { sql });
  assert.equal((await w("DELETE FROM products WHERE id = 1")).error, "write_requires_insert_update_or_replace");
  assert.equal((await w("DROP TABLE products")).error, "write_requires_insert_update_or_replace");
  assert.equal((await w("INSERT INTO products (title) VALUES ('x'); DROP TABLE products")).error, "single_statement_only");
  assert.equal((await w("UPDATE products SET title = 'x' WHERE id = 1; ALTER TABLE products ADD c")).error, "single_statement_only");
  assert.equal((await w("UPDATE products SET title = 'x' WHERE id IN (SELECT id FROM products) /* ; */ AND 1 = 1; DELETE FROM products")).error, "single_statement_only");
  assert.equal((await d("UPDATE products SET price = 0 WHERE id = 1")).error, "delete_requires_delete_statement");
  assert.equal((await d("DELETE FROM products WHERE id = 1; DROP TABLE products")).error, "single_statement_only");
  assert.equal((await d("DELETE FROM products WHERE 1 = 1 AND EXISTS (SELECT 1 FROM products) AND ATTACH = 1")).error, "ddl_or_admin_sql_blocked");
  assert.equal(count(db, "products"), 3);
});

test("RETURNING rows, upserts and REPLACE work", async () => {
  const { db, env } = store();
  const ret = await confirmed(env, "agentsam_d1_write", { sql: "INSERT INTO products (title) VALUES (?) RETURNING id, title", params: ["Cap"] });
  assert.equal(ret.result.ok, true);
  assert.equal(ret.result.rows[0].title, "Cap");
  const up = { sql: "INSERT INTO pages (slug, title) VALUES (?, ?) ON CONFLICT(slug) DO UPDATE SET title = excluded.title", params: ["about", "About"] };
  assert.equal((await confirmed(env, "agentsam_d1_write", up)).result.ok, true);
  assert.equal((await confirmed(env, "agentsam_d1_write", { ...up, params: ["about", "About us"] })).result.ok, true);
  assert.equal(count(db, "pages"), 1);
  assert.equal(db.prepare("SELECT title FROM pages").get().title, "About us");
  const rep = await confirmed(env, "agentsam_d1_write", { sql: "REPLACE INTO pages (id, slug, title) VALUES (1, 'about', 'Replaced')" });
  assert.equal(rep.result.ok, true);
  assert.equal(db.prepare("SELECT title FROM pages").get().title, "Replaced");
});

test("unsupported UPDATE shapes are refused instead of mis-counted", async () => {
  const { env } = store();
  const w = (sql) => call(env, "agentsam_d1_write", { sql });
  assert.equal((await w("UPDATE products SET price = o.p FROM (SELECT 1 AS p) o WHERE products.id = 1")).error, "update_from_not_supported");
  assert.equal((await w("UPDATE products SET price = ?1 WHERE id = ?2")).error, "positional_params_only");
});

test("missing secret, missing DB and SQL errors are explicit and run nothing", async () => {
  const { db, env } = store();
  const a = { sql: "INSERT INTO products (title) VALUES ('x')" };
  assert.equal((await call({ DB: env.DB }, "agentsam_d1_write", a)).error, "confirm_key_not_configured");
  assert.equal((await call({}, "agentsam_d1_write", a)).error, "DB_not_bound");
  const bad = await confirmed(env, "agentsam_d1_write", { sql: "INSERT INTO nope (a) VALUES (1)" });
  assert.equal(bad.result.error, "sql_error");
  assert.match(bad.result.message, /no such table/);
  assert.equal(count(db, "products"), 3);
});

test("agentsam_d1_query runs against a real engine, including WITH, trailing comments and schema reads", async () => {
  const { env } = store();
  const q = (sql, extra = {}) => call(env, "agentsam_d1_query", { sql, ...extra });
  assert.deepEqual((await q("WITH t AS (SELECT price FROM products) SELECT count(*) AS n FROM t; -- done")).rows, [{ n: 3 }]);
  assert.equal((await q("SELECT * FROM pragma_table_info('products')")).rows.length, 4);
  const capped = await q("SELECT * FROM products ORDER BY id", { limit: 2 });
  assert.equal(capped.rows.length, 2);
  assert.equal(capped.truncated, true);
});

test("tokenizer: literals and comments cannot hide or fake a statement", () => {
  assert.equal(checkSql("query", "SELECT 'a; DROP TABLE x' AS s, \"update\" FROM products").ok, true);
  assert.equal(checkSql("write", "UPDATE products SET title = 'where' WHERE id = 1").ok, true);
  assert.equal(checkSql("write", "UPDATE products SET title = 'x' -- WHERE id = 1").error, "where_required");
  assert.equal(checkSql("write", "UPDATE products SET title = 'x' /* WHERE id = 1 */").error, "where_required");
  assert.equal(checkSql("delete", "DELETE FROM products WHERE id = 1 RETURNING id").countSql, "SELECT count(*) AS n FROM products WHERE id = 1");
});
