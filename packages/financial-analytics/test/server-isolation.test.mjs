import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildFinancialAnalyticsReadModel } from "../dist/server/index.js";

function d1(sqlite, seen = []) {
  return {
    prepare(sql) {
      seen.push(sql);
      return {
        async all() { return { results: sqlite.prepare(sql).all() }; },
        bind(...values) {
          return {
            async first() { return sqlite.prepare(sql).get(...values) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
          };
        },
      };
    },
  };
}

function metric(model, id) {
  return model.metrics.find((row) => row.id === id);
}

test("financial read model only aggregates orders, transactions and usage for the session account", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const statements = [];
  sqlite.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY, account_id TEXT, status TEXT NOT NULL, total_cents INTEGER NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE finance_transactions (id TEXT PRIMARY KEY, account_id TEXT, date TEXT NOT NULL, amount_cents INTEGER NOT NULL, direction TEXT NOT NULL, is_business INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE agentsam_tool_call_log (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, cost_usd REAL NOT NULL DEFAULT 0, cost_basis TEXT NOT NULL, created_at_unix INTEGER NOT NULL);
  `);
  const now = Date.now();
  const iso = new Date(now - 60_000).toISOString();
  const unix = Math.floor((now - 60_000) / 1000);
  sqlite.prepare("INSERT INTO orders (account_id,status,total_cents,created_at) VALUES (?,?,?,?)").run("account_A", "paid", 20000, iso);
  sqlite.prepare("INSERT INTO orders (account_id,status,total_cents,created_at) VALUES (?,?,?,?)").run("account_A", "pending", 50000, iso);
  sqlite.prepare("INSERT INTO orders (account_id,status,total_cents,created_at) VALUES (?,?,?,?)").run("account_B", "paid", 990000, iso);
  sqlite.prepare("INSERT INTO finance_transactions (id,account_id,date,amount_cents,direction,is_business) VALUES (?,?,?,?,?,?)").run("a-income", "account_A", iso, 10000, "credit", 1);
  sqlite.prepare("INSERT INTO finance_transactions (id,account_id,date,amount_cents,direction,is_business) VALUES (?,?,?,?,?,?)").run("a-expense", "account_A", iso, 2500, "debit", 1);
  sqlite.prepare("INSERT INTO finance_transactions (id,account_id,date,amount_cents,direction,is_business) VALUES (?,?,?,?,?,?)").run("b-income", "account_B", iso, 999999, "credit", 1);
  sqlite.prepare("INSERT INTO finance_transactions (id,account_id,date,amount_cents,direction,is_business) VALUES (?,?,?,?,?,?)").run("a-personal", "account_A", iso, 500000, "credit", 0);
  sqlite.prepare("INSERT INTO agentsam_tool_call_log (id,account_id,cost_usd,cost_basis,created_at_unix) VALUES (?,?,?,?,?)").run("a-usage", "account_A", 0.25, "api_metered", unix);
  sqlite.prepare("INSERT INTO agentsam_tool_call_log (id,account_id,cost_usd,cost_basis,created_at_unix) VALUES (?,?,?,?,?)").run("b-usage", "account_B", 500, "api_metered", unix);

  try {
    const model = await buildFinancialAnalyticsReadModel({ db: d1(sqlite, statements), accountId: "account_A" }, "30d", now);
    assert.equal(model.currency, "USD");
    assert.equal(metric(model, "revenue").value, 200);
    assert.equal(metric(model, "order_count").value, 2);
    assert.equal(metric(model, "average_sale").value, 200);
    assert.equal(metric(model, "income").value, 100);
    assert.equal(metric(model, "expenses").value, 25);
    assert.equal(metric(model, "net_cash_flow").value, 75);
    assert.equal(metric(model, "tracked_usage_cost").value, 0.25);
    assert.equal(model.sources.find((source) => source.id === "sales_orders").recordCount, 2);
    assert.ok(statements.filter((sql) => /FROM (orders|finance_transactions|agentsam_tool_call_log)/.test(sql)).every((sql) => /WHERE account_id = \?/.test(sql)));
    await assert.rejects(buildFinancialAnalyticsReadModel({ db: d1(sqlite), accountId: "" }, "30d", now), /authenticated_account_required/);
  } finally {
    sqlite.close();
  }
});

test("legacy finance tables without account_id are never queried for tenant metrics", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, total_cents INTEGER, created_at TEXT)");
  try {
    const model = await buildFinancialAnalyticsReadModel({ db: d1(sqlite), accountId: "account_A" }, "30d");
    assert.equal(model.capabilities.includes("sales"), false);
    assert.equal(model.sources.find((source) => source.id === "sales_orders").state, "unavailable");
    assert.equal(model.sources.find((source) => source.id === "sales_orders").reason, "account_scope_missing");
  } finally {
    sqlite.close();
  }
});
