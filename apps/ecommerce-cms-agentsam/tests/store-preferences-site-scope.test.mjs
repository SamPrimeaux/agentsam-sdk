import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import { createCmsSite, ensureDefaultCmsSite } from "../backend/cms/site-context.mjs";
import { getStorePreferences, loadStorePreferences, onlineStoreOverview, postStorePreferences, PACKAGE_STORE_DEFAULTS } from "../backend/admin/store.js";

function d1(db) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async run() {
          const result = db.prepare(sql).run(...params);
          return { meta: { changes: result.changes } };
        },
      };
      return statement;
    },
  };
}

function cache() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.get(key) || null; },
    async put(key, value) { values.set(key, JSON.parse(value)); },
    async delete(key) { values.delete(key); },
  };
}

async function save(env, accountId, siteId, settings) {
  const response = await postStorePreferences(
    new Request("https://admin.example/api/admin/store/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings }),
    }),
    { ...env, CMS_SITE_CONTEXT: { id: siteId, account_id: accountId } },
    { accountId, siteId },
  );
  return { response, body: await response.json() };
}

test("store preferences live in cms_sites.settings_json per site, with isolated cache and neutral defaults", async () => {
  const db = createCmsTestDb();
  const CMS_CACHE = cache();
  try {
    db.prepare("INSERT INTO accounts(id) VALUES ('merchant')").run();
    const DB = d1(db);
    const first = await ensureDefaultCmsSite(DB, "merchant");
    const second = await createCmsSite(DB, "merchant", {
      id: "campaign-site",
      name: "Campaign",
      slug: "campaign",
      settings: { seo: { site_name: "Campaign identity" } },
    });

    const firstRoot = JSON.parse(db.prepare("SELECT settings_json FROM cms_sites WHERE id=?").get(first.id).settings_json);
    const secondRoot = JSON.parse(db.prepare("SELECT settings_json FROM cms_sites WHERE id=?").get(second.id).settings_json);
    assert.deepEqual(firstRoot.store, { ...PACKAGE_STORE_DEFAULTS });
    assert.deepEqual(secondRoot.seo, { site_name: "Campaign identity" });
    assert.deepEqual(secondRoot.store, { ...PACKAGE_STORE_DEFAULTS });

    const savedFirst = await save({ DB, CMS_CACHE }, "merchant", first.id, {
      navBrandAccent: "#123456",
      announcementBgColor: "#aabbcc",
    });
    assert.equal(savedFirst.response.status, 200, JSON.stringify(savedFirst.body));
    const savedSecond = await save({ DB, CMS_CACHE }, "merchant", second.id, {
      navBrandAccent: "#abcdef",
    });
    assert.equal(savedSecond.response.status, 200, JSON.stringify(savedSecond.body));

    const loadedFirst = await loadStorePreferences({ DB, CMS_CACHE }, { accountId: "merchant", siteId: first.id });
    const loadedSecond = await loadStorePreferences({ DB, CMS_CACHE }, { accountId: "merchant", siteId: second.id });
    assert.equal(loadedFirst.settings.navBrandAccent, "#123456");
    assert.equal(loadedFirst.settings.announcementBgColor, "#aabbcc");
    assert.equal(loadedSecond.settings.navBrandAccent, "#abcdef");
    assert.equal(loadedSecond.settings.announcementBgColor, PACKAGE_STORE_DEFAULTS.announcementBgColor);
    assert.equal(CMS_CACHE.values.has("store:preferences:" + first.id), true);
    assert.equal(CMS_CACHE.values.has("store:preferences:" + second.id), true);

    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
    assert.equal(names.includes("store_settings"), false);
    const foreign = await loadStorePreferences({ DB }, { accountId: "someone-else", siteId: first.id });
    assert.equal(foreign.ok, false);
    assert.match(foreign.error, /not_found/);
  } finally { db.close(); }
});


test("store overview uses the selected site's domain and only its CMS pages", async () => {
  const db = createCmsTestDb();
  try {
    db.prepare("INSERT INTO accounts(id) VALUES ('merchant')").run();
    const DB = d1(db);
    const first = await ensureDefaultCmsSite(DB, "merchant");
    const second = await createCmsSite(DB, "merchant", {
      id: "campaign-site",
      name: "Campaign Store",
      slug: "campaign",
    });
    db.prepare("UPDATE cms_sites SET name=?, primary_domain=? WHERE id=?")
      .run("Inner Animal Media", "inneranimalmedia.com", first.id);
    db.prepare("UPDATE cms_sites SET primary_domain=? WHERE id=?")
      .run("campaign.example", second.id);

    db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,route_path,page_type,title,status) VALUES (?,?,?,?,?,?,?,?)")
      .run("page-inneranimal", "merchant", first.id, "home", "/", "standard", "Inner Animal Media Home", "published");
    db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,route_path,page_type,title,status) VALUES (?,?,?,?,?,?,?,?)")
      .run("page-campaign", "merchant", second.id, "home", "/", "standard", "Campaign Home", "draft");

    const prefsResponse = await getStorePreferences({ DB }, { accountId: "merchant", siteId: first.id });
    const prefs = await prefsResponse.json();
    assert.equal(prefs.domain, "inneranimalmedia.com");
    assert.equal(prefs.site.id, first.id);
    assert.equal(prefs.company.name, "Inner Animal Media");

    const overviewResponse = await onlineStoreOverview({ DB }, "merchant", first.id);
    const overview = await overviewResponse.json();
    assert.equal(overview.store.domain, "inneranimalmedia.com");
    assert.equal(overview.store.company_name, "Inner Animal Media");
    assert.equal(overview.store.site_id, first.id);
    assert.deepEqual(overview.pages.map(page => page.slug), ["home"]);

    const campaignResponse = await onlineStoreOverview({ DB }, "merchant", second.id);
    const campaign = await campaignResponse.json();
    assert.equal(campaign.store.domain, "campaign.example");
    assert.equal(campaign.store.site_id, second.id);
    assert.deepEqual(campaign.pages.map(page => page.slug), ["home"]);
  } finally { db.close(); }
});
