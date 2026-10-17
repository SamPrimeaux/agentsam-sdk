import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { migrateAccounts } from "../db/schema/migrations/identity-accounts.mjs";
import { createIdentityRepository } from "../db/schema/core/identity-repository.mjs";

const manifest = { accounts: { maxDepth: 3, kinds: ["organization", "reseller", "client"], roles: ["owner", "editor"], plans: { free: { entitlements: { "brand.powered_by.visible": true } }, agency: { entitlements: { "brand.powered_by.visible": false } } } } };

function wrap(db) {
  return {
    exec(sql) { db.exec(sql); },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async first(sql, params = []) { return db.prepare(sql).get(...params) || null; },
    async run(sql, params = []) { return db.prepare(sql).run(...params); },
  };
}

test("fresh install creates the identity tables and skips when slug exists", async () => {
  const db = new DatabaseSync(":memory:");
  const first = await migrateAccounts(wrap(db));
  assert.equal(first.fresh, true);
  const second = await migrateAccounts(wrap(db));
  assert.equal(second.skipped, true);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'account_domains'").get().name, "account_domains");
});

test("migration preserves ids and cms foreign keys", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE accounts (id TEXT PRIMARY KEY, account_key TEXT, display_name TEXT, status TEXT, created_at INTEGER, updated_at INTEGER)");
  db.exec("INSERT INTO accounts (id, account_key, display_name, status, created_at, updated_at) VALUES ('acct_old', 'fuel', 'Fuel', 'active', 1700000000, 1700000000)");
  db.exec("CREATE TABLE cms_pages (id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id))");
  db.exec("INSERT INTO cms_pages (id, account_id) VALUES ('page_1', 'acct_old')");
  const result = await migrateAccounts(wrap(db));
  assert.equal(result.migrated, true);
  const row = db.prepare("SELECT id, slug, created_at FROM accounts WHERE id = 'acct_old'").get();
  assert.equal(row.slug, "fuel");
  assert.equal(row.created_at, "2023-11-14 22:13:20");
  assert.equal(db.prepare("SELECT account_id FROM cms_pages WHERE id = 'page_1'").get().account_id, "acct_old");
});

test("hostname, brand inheritance, cycle refusal, and entitlement override", async () => {
  const db = new DatabaseSync(":memory:");
  await migrateAccounts(wrap(db));
  const repo = createIdentityRepository(wrap(db), manifest);
  await repo.createAccount({ id: "platform", slug: "platform", display_name: "Platform", kind: "organization" });
  await repo.createAccount({ id: "reseller", slug: "reseller", display_name: "Reseller", kind: "reseller", parent_account_id: "platform" });
  await repo.createAccount({ id: "client", slug: "client", display_name: "Client", kind: "client", parent_account_id: "reseller", plan_key: "agency" });
  db.prepare("INSERT INTO account_domains (id, account_id, hostname) VALUES ('dom_1', 'client', 'shop.example')").run();
  db.prepare("INSERT INTO account_settings (account_id, setting_key, value_json) VALUES ('platform', 'brand.name', '\"Platform\"'), ('reseller', 'brand.logo_asset', '\"logo\"')").run();
  db.prepare("UPDATE account_entitlements SET value_json = 'false', source = 'override' WHERE account_id = 'client' AND entitlement_key = 'brand.powered_by.visible'").run();
  assert.equal((await repo.resolveAccountByHostname("shop.example")).id, "client");
  const brand = await repo.getBrand("client");
  assert.equal(brand["brand.name"], "Platform");
  assert.equal(brand["brand.logo_asset"], "logo");
  assert.equal(await repo.hasEntitlement("client", "brand.powered_by.visible"), false);
  db.exec("PRAGMA foreign_keys = OFF");
  db.prepare("UPDATE accounts SET parent_account_id = 'client' WHERE id = 'platform'").run();
  await assert.rejects(repo.createAccount({ id: "loop", slug: "loop", display_name: "Loop", kind: "client", parent_account_id: "platform" }));
});
