import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb } from "./cms-test-db.mjs";
import { handleAdminCmsApi } from "../backend/cms/api.js";

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
          return { ...result, meta: { changes: result.changes } };
        },
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

function project(name = "Resolve") {
  return {
    schema: "agentsam.theme-project.v1",
    id: "theme_resolve",
    name,
    revision: 0,
    pages: [{
      slug: "home", title: "Home",
      template: "<!doctype html><html><body><!--theme-section:section_1--></body></html>",
      sections: [{
        key: "section_1", name: "Hero",
        html: "<section data-theme-project-field=\"field_1\">Hero</section>",
        content: { field_1: "Hero", __editor: { templateKey: "section_1", visibility: { enabled: true }, blocks: [] } },
        schema: { key: "section_1", fields: [{ key: "field_1", label: "Headline", type: "text" }], settings: [], blocks: [] },
      }],
    }],
  };
}

function environment(sqlite) {
  const objects = new Map();
  return {
    DB: d1(sqlite),
    WEBSITE_ASSETS: {
      async put(key, body) { objects.set(key, body); },
      async get(key) {
        if (!objects.has(key)) return null;
        return { async text() { return objects.get(key); } };
      },
    },
    objects,
  };
}

test("theme projects and theme selections are isolated by CMS site", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    sqlite.exec(`
      INSERT INTO accounts(id) VALUES ('acct-a');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
        VALUES ('site-a','acct-a','Primary','default','active',1),
               ('site-a2','acct-a','Campaign','campaign','active',0);
    `);

    const create = await handleAdminCmsApi(
      request("/api/admin/cms/theme-projects", "POST", { project: project(), site_id: "site-a2" }),
      env, new URL("https://cms.test/api/admin/cms/theme-projects"), { accountId: "acct-a" },
    );
    assert.equal(create.status, 201);

    const row = sqlite.prepare("SELECT site_id,content_object_key,content_version FROM cms_globals WHERE global_key='theme-project:theme_resolve'").get();
    assert.equal(row.site_id, "site-a2");
    assert.ok(row.content_object_key);
    assert.equal(row.content_version, 1);

    const campaignList = await handleAdminCmsApi(
      request("/api/admin/cms/theme-projects?site_id=site-a2"), env,
      new URL("https://cms.test/api/admin/cms/theme-projects?site_id=site-a2"), { accountId: "acct-a" },
    );
    assert.equal((await campaignList.json()).projects.length, 1);

    const primaryList = await handleAdminCmsApi(
      request("/api/admin/cms/theme-projects?site_id=site-a"), env,
      new URL("https://cms.test/api/admin/cms/theme-projects?site_id=site-a"), { accountId: "acct-a" },
    );
    assert.equal((await primaryList.json()).projects.length, 0);

    const save = await handleAdminCmsApi(
      request("/api/admin/cms/theme-projects/theme_resolve", "PUT", {
        project: project("Resolve Updated"), expected_version: 1, site_id: "site-a2",
      }), env, new URL("https://cms.test/api/admin/cms/theme-projects/theme_resolve"), { accountId: "acct-a" },
    );
    assert.equal(save.status, 200);
    assert.equal(sqlite.prepare("SELECT content_version FROM cms_globals WHERE global_key='theme-project:theme_resolve'").get().content_version, 2);

    const selection = await handleAdminCmsApi(
      request("/api/admin/cms/theme-selection?site_id=site-a2", "PUT", {
        slug: "heuristic", expected_version: 0, site_id: "site-a2",
      }), env, new URL("https://cms.test/api/admin/cms/theme-selection?site_id=site-a2"), { accountId: "acct-a" },
    );
    assert.equal(selection.status, 200);
    const themeRow = sqlite.prepare("SELECT site_id,inline_content_json FROM cms_globals WHERE global_key='theme'").get();
    assert.equal(themeRow.site_id, "site-a2");
    assert.equal(JSON.parse(themeRow.inline_content_json).preview, "heuristic");
    const revisions = sqlite.prepare("SELECT DISTINCT site_id FROM cms_revisions ORDER BY site_id").all();
    assert.deepEqual(revisions.map(row => row.site_id), ["site-a2"]);

    const crossAccount = await handleAdminCmsApi(
      request("/api/admin/cms/theme-projects/theme_resolve?site_id=site-a2"), env,
      new URL("https://cms.test/api/admin/cms/theme-projects/theme_resolve?site_id=site-a2"), { accountId: "acct-other" },
    );
    assert.equal(crossAccount.status, 404);
  } finally { sqlite.close(); }
});
