import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import { handleAdminCmsApi, listPagesAdmin } from "../backend/cms/api.js";
import { isAllowedStudioCmsBridgeRoute } from "../backend/cms/studio-bridge-protocol.js";
import { resolveSingleCmsAccount } from "../backend/cms/studio-bridge.js";

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
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
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
    assert.deepEqual(payload.sites.map(site => site.page_count), [1, 1]);
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

test("admin API creates a second site with a starter, without changing the account's default", async () => {
  const sqlite = createCmsTestDb();
  const objects=new Map();
  const env = { DB: d1(sqlite), WEBSITE_ASSETS: {
    async put(key,value){objects.set(key,String(value));},
    async get(key){return objects.has(key)?{text:async()=>objects.get(key)}:null;},
  }};
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
    const result=await second.json();
    assert.equal(result.site.is_default, 0);
    assert.equal(result.starter.installed,true);
    assert.match(result.starter.editor_url,/theme-project-editor\?project=theme_heuristic&site_id=/);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE global_type='theme-project'").get().n,2);
    // Package manifest can be shared across one merchant's sites; authored
    // page revisions remain independently content-addressed in R2.
    assert.ok(objects.size>=3,'shared release manifest plus site-owned revisions');
    assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT content_object_key) AS n FROM cms_globals WHERE global_type='theme-project'").get().n,2);
  } finally { sqlite.close(); }
});

test("admin API creates, edits, and opens a site-scoped page by stable page id", async () => {
  const sqlite = createCmsTestDb();
  const objects = new Map();
  const env = {
    DB: d1(sqlite),
    WEBSITE_ASSETS: {
      async put(key, value) { objects.set(key, String(value)); },
      async get(key) {
        if (!objects.has(key)) return null;
        const value = objects.get(key);
        return { text: async () => value };
      },
      async delete(key) { objects.delete(key); },
    },
  };
  try {
    sqlite.exec(`
      INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('site-a','acct-a','Primary','default','active',1),
               ('site-a2','acct-a','Campaign','campaign','active',0),
               ('site-b','acct-b','Other','default','active',1);
    `);

    const createdResponse = await handleAdminCmsApi(
      request("/api/admin/cms/pages?site_id=site-a", "POST", { title: "About Us" }),
      env, new URL("https://cms.test/api/admin/cms/pages?site_id=site-a"), { accountId: "acct-a" },
    );
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.page.slug, "about-us");
    assert.equal(created.page.route_path, "/about-us");
    assert.equal(created.page.site_id, "site-a");
    assert.equal(created.page.status, "draft");
    assert.ok(created.page.id);

    const getUrl = `/api/admin/cms/pages/about-us?site_id=site-a&page_id=${created.page.id}`;
    const loadedResponse = await handleAdminCmsApi(
      request(getUrl), env, new URL("https://cms.test" + getUrl), { accountId: "acct-a" },
    );
    assert.equal(loadedResponse.status, 200);
    assert.equal((await loadedResponse.json()).page.id, created.page.id);

    const updatedUrl = `/api/admin/cms/pages/about-us?site_id=site-a&page_id=${created.page.id}`;
    const updatedResponse = await handleAdminCmsApi(
      request(updatedUrl, "PUT", { title: "Our Story", slug: "our-story" }),
      env, new URL("https://cms.test" + updatedUrl), { accountId: "acct-a" },
    );
    assert.equal(updatedResponse.status, 200);
    assert.equal((await updatedResponse.json()).page.slug, "our-story");

    const staleSlugUrl = `/api/admin/cms/pages/about-us?site_id=site-a&page_id=${created.page.id}`;
    const reopened = await handleAdminCmsApi(
      request(staleSlugUrl), env, new URL("https://cms.test" + staleSlugUrl), { accountId: "acct-a" },
    );
    assert.equal(reopened.status, 200);
    assert.equal((await reopened.json()).page.slug, "our-story");

    const addSectionUrl = `/api/admin/cms/pages/our-story/sections?site_id=site-a&page_id=${created.page.id}`;
    const sectionResponse = await handleAdminCmsApi(
      request(addSectionUrl, "POST", { templateKey: "portable", themePreset: "revise/editorial-statement" }),
      env, new URL("https://cms.test" + addSectionUrl), { accountId: "acct-a" },
    );
    assert.equal(sectionResponse.status, 201);
    const section = await sectionResponse.json();
    assert.ok(section.section_key);

    const sectionContent = section.section.content;
    sectionContent.title = "A real editable page";
    sectionContent.body = "Saved through the site-scoped CMS API.";
    const saveSectionUrl = `/api/admin/cms/pages/our-story/sections/${section.section_key}?site_id=site-a&page_id=${created.page.id}`;
    const saved = await handleAdminCmsApi(
      request(saveSectionUrl, "PUT", { content: sectionContent, expected_version: 1 }),
      env, new URL("https://cms.test" + saveSectionUrl), { accountId: "acct-a" },
    );
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).version, 2);

    const refreshed = await handleAdminCmsApi(
      request(`/api/admin/cms/pages/our-story?site_id=site-a&page_id=${created.page.id}`),
      env, new URL("https://cms.test/api/admin/cms/pages/our-story"), { accountId: "acct-a" },
    );
    const refreshedPage = (await refreshed.json()).page;
    assert.equal(refreshedPage.sections[0].content.title, "A real editable page");
    assert.equal(refreshedPage.sections[0].version, 2);

    const duplicate = await handleAdminCmsApi(
      request("/api/admin/cms/pages?site_id=site-a", "POST", { title: "Our Story", slug: "our-story" }),
      env, new URL("https://cms.test/api/admin/cms/pages?site_id=site-a"), { accountId: "acct-a" },
    );
    assert.equal(duplicate.status, 409);

    const sameSlugOtherSite = await handleAdminCmsApi(
      request("/api/admin/cms/pages?site_id=site-a2", "POST", { title: "Our Story", slug: "our-story" }),
      env, new URL("https://cms.test/api/admin/cms/pages?site_id=site-a2"), { accountId: "acct-a" },
    );
    assert.equal(sameSlugOtherSite.status, 201);
    assert.equal((await sameSlugOtherSite.json()).page.site_id, "site-a2");

    const crossSite = await handleAdminCmsApi(
      request(`/api/admin/cms/pages/our-story?site_id=site-b&page_id=${created.page.id}`),
      env, new URL(`https://cms.test/api/admin/cms/pages/our-story?site_id=site-b&page_id=${created.page.id}`),
      { accountId: "acct-a" },
    );
    assert.equal(crossSite.status, 404);
  } finally { sqlite.close(); }
});

test("Studio CMS bridge permits page creation without broadening page-route writes", () => {
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-projects", "GET"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-projects", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-projects", "DELETE"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-projects/theme_heuristic", "GET"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-projects/theme_heuristic", "PUT"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-projects/theme_heuristic", "DELETE"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("themes/heuristic/install", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("themes/heuristic/install", "GET"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("themes/heuristic/delete", "POST"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-selection", "PUT"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-selection", "POST"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("themes", "GET"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("orders", "GET"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("theme-products/drafts", "POST"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages", "GET"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages", "DELETE"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us", "GET"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us", "POST"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/sections", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/generated-accept", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/sections/hero/generated-revisions", "GET"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/sections/hero/generated-restore", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/sections/hero/restore", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/catalog-resources", "GET"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/catalog-resources", "POST"), true);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/generated-accept", "GET"), false);
  assert.equal(isAllowedStudioCmsBridgeRoute("pages/about-us/sections/hero/generated-revisions", "POST"), false);
});

test("Studio bridge resolves the account before any CMS page exists", async () => {
  const sqlite = createCmsTestDb();
  try {
    sqlite.exec("INSERT INTO accounts(id) VALUES ('acct-a')");
    const account = await resolveSingleCmsAccount({ DB: d1(sqlite) });
    assert.equal(account, "acct-a");

    sqlite.exec(`
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('site-a','acct-a','Primary','default','active',1);
    `);
    assert.equal(await resolveSingleCmsAccount({ DB: d1(sqlite) }), "acct-a");
  } finally { sqlite.close(); }
});

test("Theme Editor global settings resolve to a distinct page identity per site", async () => {
  const sqlite = createCmsTestDb();
  const objects = new Map();
  const env = {
    DB: d1(sqlite),
    WEBSITE_ASSETS: {
      async put(key, value) { objects.set(key, String(value)); },
      async get(key) {
        if (!objects.has(key)) return null;
        return { text: async () => objects.get(key) };
      },
      async delete(key) { objects.delete(key); },
    },
  };
  try {
    sqlite.exec(`
      INSERT INTO accounts(id) VALUES ('acct-a');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('site-a','acct-a','Primary','default','active',1),
               ('site-a2','acct-a','Campaign','campaign','active',0);
    `);
    const primaryUrl = "/api/admin/cms/pages/site?site_id=site-a";
    const campaignUrl = "/api/admin/cms/pages/site?site_id=site-a2";
    const primary = await handleAdminCmsApi(
      request(primaryUrl), env, new URL("https://cms.test" + primaryUrl), { accountId: "acct-a" },
    );
    const campaign = await handleAdminCmsApi(
      request(campaignUrl), env, new URL("https://cms.test" + campaignUrl), { accountId: "acct-a" },
    );
    assert.equal(primary.status, 200);
    assert.equal(campaign.status, 200);
    const primaryPage = (await primary.json()).page;
    const campaignPage = (await campaign.json()).page;
    assert.equal(primaryPage.page_type, "global");
    assert.equal(campaignPage.page_type, "global");
    assert.equal(primaryPage.site_id, "site-a");
    assert.equal(campaignPage.site_id, "site-a2");
    assert.notEqual(primaryPage.id, campaignPage.id);

    const addGlobalSection = "/api/admin/cms/pages/site/sections?site_id=site-a2";
    const created = await handleAdminCmsApi(
      request(addGlobalSection, "POST", { templateKey: "portable", themePreset: "revise/editorial-statement" }),
      env, new URL("https://cms.test" + addGlobalSection), { accountId: "acct-a" },
    );
    assert.equal(created.status, 201);
    const section = (await created.json()).section;
    assert.ok(section.id);

    const otherSiteRead = await handleAdminCmsApi(
      request("/api/admin/cms/pages/site?site_id=site-a"), env,
      new URL("https://cms.test/api/admin/cms/pages/site?site_id=site-a"), { accountId: "acct-a" },
    );
    assert.deepEqual((await otherSiteRead.json()).page.sections, []);
  } finally { sqlite.close(); }
});


test("generated section history and acceptance resolve through the selected site and page identity", async () => {
  const sqlite = createCmsTestDb();
  const env = {
    DB: d1(sqlite),
    WEBSITE_ASSETS: { async put() {}, async get() { return null; }, async delete() {} },
  };
  try {
    sqlite.exec(`
      INSERT INTO accounts(id) VALUES ('acct-a');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('site-a','acct-a','Primary','default','active',1),
               ('site-a2','acct-a','Campaign','campaign','active',0);
    `);
    const createUrl = "/api/admin/cms/pages?site_id=site-a";
    const created = await handleAdminCmsApi(
      request(createUrl, "POST", { title: "Generated page" }),
      env, new URL("https://cms.test" + createUrl), { accountId: "acct-a" },
    );
    const page = (await created.json()).page;
    sqlite.exec(
      "INSERT INTO cms_page_sections (id,account_id,page_id,section_key,section_type,sort_order,status,inline_content_json,content_version,metadata_json) " +
      "VALUES ('section-generated','acct-a','" + page.id + "','generated-hero','hero',0,'draft','{}',1,'{}'); " +
      "INSERT INTO cms_revisions (id,account_id,site_id,entity_type,entity_id,revision_number,revision_kind,snapshot_json,metadata_json) " +
      "VALUES ('revision-generated','acct-a','site-a','section','section-generated',1,'draft','{}','{\"source\":\"agentsam\"}');"
    );

    const historyUrl = "/api/admin/cms/pages/generated-page/sections/generated-hero/generated-revisions?site_id=site-a&page_id=" + page.id;
    const history = await handleAdminCmsApi(
      request(historyUrl), env, new URL("https://cms.test" + historyUrl), { accountId: "acct-a" },
    );
    assert.equal(history.status, 200);
    assert.equal((await history.json()).revisions[0].number, 1);

    const wrongSiteUrl = "/api/admin/cms/pages/generated-page/sections/generated-hero/generated-revisions?site_id=site-a2&page_id=" + page.id;
    const wrongSite = await handleAdminCmsApi(
      request(wrongSiteUrl), env, new URL("https://cms.test" + wrongSiteUrl), { accountId: "acct-a" },
    );
    assert.equal(wrongSite.status, 404);

    const acceptUrl = "/api/admin/cms/pages/generated-page/generated-accept?site_id=site-a&page_id=" + page.id;
    const invalidAccept = await handleAdminCmsApi(
      request(acceptUrl, "POST", { record: {} }),
      env, new URL("https://cms.test" + acceptUrl), { accountId: "acct-a" },
    );
    assert.equal(invalidAccept.status, 422);
  } finally { sqlite.close(); }
});


test("page creation protects the site-wide global identity", async () => {
  const sqlite = createCmsTestDb();
  const env = { DB: d1(sqlite) };
  try {
    sqlite.exec(`
      INSERT INTO accounts(id) VALUES ('acct-a');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('site-a','acct-a','Primary','default','active',1);
    `);
    const reserved = await handleAdminCmsApi(
      request("/api/admin/cms/pages?site_id=site-a", "POST", { title: "Site", slug: "site" }),
      env, new URL("https://cms.test/api/admin/cms/pages?site_id=site-a"), { accountId: "acct-a" },
    );
    assert.equal(reserved.status, 409);
    const invalidGlobal = await handleAdminCmsApi(
      request("/api/admin/cms/pages?site_id=site-a", "POST", { title: "Global", slug: "global", page_type: "global" }),
      env, new URL("https://cms.test/api/admin/cms/pages?site_id=site-a"), { accountId: "acct-a" },
    );
    assert.equal(invalidGlobal.status, 400);
  } finally { sqlite.close(); }
});


test("catalog embed installs and lists against the selected site-first page identity", async () => {
  const sqlite = createCmsTestDb();
  const objects = new Map();
  const env = {
    DB: d1(sqlite),
    WEBSITE_ASSETS: {
      async put(key, value) { objects.set(key, String(value)); },
      async get(key) { return objects.has(key) ? { text: async () => objects.get(key) } : null; },
      async delete(key) { objects.delete(key); },
    },
  };
  try {
    sqlite.exec("INSERT INTO accounts(id) VALUES ('acct-a');");
    sqlite.exec("INSERT INTO cms_sites(id,account_id,name,slug,status,is_default) VALUES ('site-a','acct-a','Primary','default','active',1),('site-a2','acct-a','Campaign','campaign','active',0);");
    const createUrl = "/api/admin/cms/pages?site_id=site-a";
    const created = await handleAdminCmsApi(
      request(createUrl, "POST", { title: "Embed page" }),
      env, new URL("https://cms.test" + createUrl), { accountId: "acct-a" },
    );
    const page = (await created.json()).page;

    const installUrl = "/api/admin/cms/pages/embed-page/catalog-resources?site_id=site-a&page_id=" + page.id;
    const installed = await handleAdminCmsApi(
      request(installUrl, "POST", { catalogKey: "contact_form" }),
      env, new URL("https://cms.test" + installUrl), { accountId: "acct-a" },
    );
    const installedBody = await installed.json();
    assert.equal(installed.status, 201, JSON.stringify(installedBody));
    assert.equal(installedBody.catalog_key, "contact_form");
    assert.equal(installedBody.canonical.status, "linked");

    const listed = await handleAdminCmsApi(
      request(installUrl, "GET"), env, new URL("https://cms.test" + installUrl), { accountId: "acct-a" },
    );
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).installed[0].catalog_key, "contact_form");

    const crossSiteUrl = "/api/admin/cms/pages/embed-page/catalog-resources?site_id=site-a2&page_id=" + page.id;
    const crossSite = await handleAdminCmsApi(
      request(crossSiteUrl, "GET"), env, new URL("https://cms.test" + crossSiteUrl), { accountId: "acct-a" },
    );
    assert.equal(crossSite.status, 404);
  } finally { sqlite.close(); }
});

test("same-name sites return distinct real page counts without exposing another merchant", async () => {
  const sqlite = createCmsTestDb();
  const env = { DB: d1(sqlite) };
  try {
    sqlite.exec(`
      INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('s1','acct-a','Inner Animal Media','inneranimalmedia','active',0),
               ('s2','acct-a','Inner Animal Media','inneranimal','active',0),
               ('s3','acct-b','Inner Animal Media','other','active',1);
      INSERT INTO cms_pages(id,account_id,site_id,slug,route_path,title,status)
        VALUES ('p1','acct-a','s1','home','/','Home','draft'),
               ('p2','acct-a','s1','about','/about','About','draft'),
               ('p3','acct-b','s3','secret','/secret','Private','draft');
    `);
    const url = new URL("https://cms.test/api/admin/cms/sites");
    const response = await handleAdminCmsApi(request(url.pathname), env, url, { accountId: "acct-a" });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.default_site_id, null);
    assert.deepEqual(data.sites.map(site => ({
      id: site.id, name: site.name, slug: site.slug, pages: site.page_count,
    })).sort((a, b) => a.id.localeCompare(b.id)), [
      { id: "s1", name: "Inner Animal Media", slug: "inneranimalmedia", pages: 2 },
      { id: "s2", name: "Inner Animal Media", slug: "inneranimal", pages: 0 },
    ]);
  } finally { sqlite.close(); }
});
