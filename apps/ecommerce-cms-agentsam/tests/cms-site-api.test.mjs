import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import { handleAdminCmsApi, listPagesAdmin } from "../backend/cms/api.js";

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

function request(path, method = "GET", body = undefined) {
  return new Request(`https://cms.test${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("admin API exposes account-owned sites and scopes page inventory by site", async () => {
  const sqlite = createCmsTestDb();
  const env = { DB: d1(sqlite) };
  try {
    sqlite.exec(`
      INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('site-a','acct-a','Primary','default','active',1),
               ('site-a2','acct-a','Campaign','campaign','active',0),
               ('site-b','acct-b','Other','default','active',1);
      INSERT INTO cms_pages(id,account_id,site_id,slug,route_path,title,status)
        VALUES ('page-a','acct-a','site-a','home','/','Primary home','published'),
               ('page-a2','acct-a','site-a2','home','/','Campaign home','draft'),
               ('page-b','acct-b','site-b','home','/','Other home','draft');
    `);

    const primary = await listPagesAdmin(env, "acct-a");
    assert.equal(primary.site.id, "site-a");
    assert.deepEqual(primary.pages.filter(page => page.id).map(page => page.title), ["Primary home"]);

    const campaign = await listPagesAdmin(env, "acct-a", "site-a2");
    assert.equal(campaign.site.id, "site-a2");
    assert.deepEqual(campaign.pages.map(page => page.title), ["Campaign home"]);

    const response = await handleAdminCmsApi(request("/api/admin/cms/sites"), env, new URL("https://cms.test/api/admin/cms/sites"), { accountId: "acct-a" });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.sites.length, 2);
    assert.equal(payload.default_site_id, "site-a");

    const pageResponse = await handleAdminCmsApi(
      request("/api/admin/cms/pages?site_id=site-a2"), env,
      new URL("https://cms.test/api/admin/cms/pages?site_id=site-a2"), { accountId: "acct-a" },
    );
    assert.equal(pageResponse.status, 200);
    const pagePayload = await pageResponse.json();
    assert.deepEqual(pagePayload.pages.filter(page => page.id).map(page => page.title), ["Campaign home"]);

    const forbidden = await handleAdminCmsApi(
      request("/api/admin/cms/pages?site_id=site-b"), env,
      new URL("https://cms.test/api/admin/cms/pages?site_id=site-b"), { accountId: "acct-a" },
    );
    assert.equal(forbidden.status, 404);
  } finally { sqlite.close(); }
});

test("admin API creates a second site without changing the account's default", async () => {
  const sqlite = createCmsTestDb();
  const env = { DB: d1(sqlite) };
  try {
    sqlite.exec("INSERT INTO accounts(id) VALUES ('acct-a')");
    const response = await handleAdminCmsApi(
      request("/api/admin/cms/sites", "POST", { name: "Campaign", slug: "campaign", primary_domain: "campaign.example.com" }),
      env, new URL("https://cms.test/api/admin/cms/sites"), { accountId: "acct-a" },
    );
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.site.slug, "campaign");
    assert.equal(created.site.is_default, 1, "first site for a new account becomes default");
    const second = await handleAdminCmsApi(
      request("/api/admin/cms/sites", "POST", { name: "Storefront", slug: "storefront" }),
      env, new URL("https://cms.test/api/admin/cms/sites"), { accountId: "acct-a" },
    );
    assert.equal(second.status, 201);
    assert.equal((await second.json()).site.is_default, 0);
  } finally { sqlite.close(); }
});
