import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import { createCmsSite, ensureDefaultCmsSite, listCmsSites, resolveCmsSite } from "../backend/cms/site-context.mjs";

function d1(db) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() { return db.prepare(sql).run(...params); },
      };
      return statement;
    },
  };
}

test("site listing bootstraps a default site for a new account", async () => {
  const db = createCmsTestDb();
  try {
    db.prepare("INSERT INTO accounts(id) VALUES ('acct-a')").run();
    const store = d1(db);
    const sites = await listCmsSites(store, "acct-a");
    assert.equal(sites.length, 1);
    assert.equal(sites[0].slug, "default");
    assert.equal(sites[0].is_default, 1);
    assert.equal((await ensureDefaultCmsSite(store, "acct-a")).id, sites[0].id);
  } finally { db.close(); }
});

test("a merchant can create multiple sites with their own domains and resolve each safely", async () => {
  const db = createCmsTestDb();
  try {
    db.prepare("INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b')").run();
    const store = d1(db);
    const primary = await ensureDefaultCmsSite(store, "acct-a");
    const second = await createCmsSite(store, "acct-a", {
      id: "site-second", name: "Campaign site", slug: "campaign",
      primary_domain: "campaign.example.com", domain_aliases: ["www.campaign.example.com"],
    });
    assert.equal(second.is_default, 0);
    assert.equal((await resolveCmsSite(store, { accountId: "acct-a", siteId: second.id })).id, second.id);
    assert.equal((await resolveCmsSite(store, { hostname: "www.campaign.example.com" })).id, second.id);
    assert.equal((await resolveCmsSite(store, { accountId: "acct-a", hostname: "www.campaign.example.com" })).id, second.id);
    await assert.rejects(resolveCmsSite(store, { accountId: "acct-b", hostname: "www.campaign.example.com" }), /not_found/);
    await assert.rejects(resolveCmsSite(store, { accountId: "acct-b", siteId: second.id }), /not_found/);
    assert.equal((await listCmsSites(store, "acct-a")).length, 2);
    assert.equal(primary.is_default, 1);
  } finally { db.close(); }
});

test("site creation validates slugs and hostnames and rejects account-local slug collisions", async () => {
  const db = createCmsTestDb();
  try {
    db.prepare("INSERT INTO accounts(id) VALUES ('acct-a')").run();
    const store = d1(db);
    await ensureDefaultCmsSite(store, "acct-a");
    await assert.rejects(createCmsSite(store, "acct-a", { id: "not a valid id", name: "Bad", slug: "bad-id" }), /id_invalid/);
    await assert.rejects(createCmsSite(store, "acct-a", { name: "Bad", slug: "../bad" }), /slug_invalid/);
    await assert.rejects(createCmsSite(store, "acct-a", { name: "Bad", slug: "bad", primary_domain: "not a host" }), /domain_invalid/);
    await createCmsSite(store, "acct-a", { name: "Campaign", slug: "campaign" });
    await assert.rejects(createCmsSite(store, "acct-a", { name: "Duplicate", slug: "campaign" }), /UNIQUE|constraint/i);
  } finally { db.close(); }
});
