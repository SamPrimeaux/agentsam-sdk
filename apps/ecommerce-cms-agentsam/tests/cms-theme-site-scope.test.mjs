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

test("theme project and theme catalog APIs refuse implicit default-site fallback", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    sqlite.exec(`INSERT INTO accounts(id) VALUES ('acct-a');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('site-a','acct-a','Primary','default','active',1);`);
    const cases = [
      [request('/api/admin/cms/theme-projects', 'POST', { project: project() }), '/api/admin/cms/theme-projects'],
      [request('/api/admin/cms/theme-projects/theme_resolve'), '/api/admin/cms/theme-projects/theme_resolve'],
      [request('/api/admin/cms/theme-projects/theme_resolve', 'PUT', { project: project(), expected_version: 1 }), '/api/admin/cms/theme-projects/theme_resolve'],
      [request('/api/admin/cms/themes'), '/api/admin/cms/themes'],
      [request('/api/admin/cms/theme-selection', 'PUT', { slug: 'plain-jane', expected_version: 0 }), '/api/admin/cms/theme-selection'],
    ];
    for (const [req, path] of cases) {
      const response = await handleAdminCmsApi(req, env, new URL('https://cms.test' + path), { accountId: 'acct-a' });
      assert.equal(response.status, 400, path + ' must reject an omitted site_id');
      assert.equal((await response.json()).error, 'site_id_required');
    }
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals").get().n, 0,
      'implicit theme operations must not write into the default site');
  } finally { sqlite.close(); }
});


test("each duplicate is its own draft site with a cms_site_themes row; saves sync it; delete archives only drafts", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  const call = (path, method, body, accountId = "acct-a") => handleAdminCmsApi(
    request(path, method, body), env, new URL(`https://cms.test${path}`), { accountId },
  );
  try {
    sqlite.exec(`
      -- Historical migration 005 creates this legacy FK target. Runtime catalog
      -- lookups use products; production migration 1384 rekeys source_product_id.
      CREATE TABLE IF NOT EXISTS agentsam_products(id TEXT PRIMARY KEY, slug TEXT, kind TEXT);
      CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, slug TEXT, product_kind TEXT, catalog_kind TEXT);
      CREATE TABLE IF NOT EXISTS agentsam_product_releases(id TEXT PRIMARY KEY, product_id TEXT, version TEXT);
      INSERT INTO accounts(id) VALUES ('acct-a'),('acct-other');
      INSERT INTO cms_sites(id,account_id,name,slug,status,is_default,settings_json)
        VALUES ('site-live','acct-a','Live','default','active',1,'{}'),
               ('site-src','acct-a','Source — Draft','theme-draft-resolve-1-0-0','draft',0,'{"kind":"marketplace-theme-draft"}');
    `);
    assert.equal((await call("/api/admin/cms/theme-projects", "POST", { project: project("Source"), site_id: "site-src" })).status, 201);

    const first = await (await call("/api/admin/cms/theme-projects/theme_resolve/duplicate", "POST", { site_id: "site-src", name: "Try one" })).json();
    const second = await (await call("/api/admin/cms/theme-projects/theme_resolve/duplicate", "POST", { site_id: "site-src" })).json();
    assert.ok(first.ok && second.ok);
    assert.notEqual(first.site_id, second.site_id);
    assert.match(first.editor_url, new RegExp('admin/sites/cmssite_[A-Za-z0-9_-]+/themes/copy_[A-Za-z0-9_-]+/editor/home'));
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_site_themes WHERE account_id='acct-a' AND status='ready'").get().n, 2);

    // A failed try leaves no orphan draft site behind.
    const before = sqlite.prepare("SELECT COUNT(*) n FROM cms_sites").get().n;
    assert.equal((await call("/api/admin/cms/themes/plain-jane/install", "POST", { version: "0.1.0" })).status, 400);
    assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM cms_sites").get().n, before);

    const listed = await (await call("/api/admin/cms/theme-projects", "GET")).json();
    assert.deepEqual(listed.drafts.map((d) => d.site_id).sort(), [first.site_id, second.site_id].sort());
    assert.equal((await (await call("/api/admin/cms/theme-projects", "GET", undefined, "acct-other")).json()).drafts.length, 0);

    const edited = project("Edited");
    edited.id = first.project.id;
    const saved = await call(`/api/admin/cms/theme-projects/${first.project.id}`, "PUT",
      { project: edited, expected_version: 1, site_id: first.site_id });
    assert.equal(saved.status, 200);
    assert.equal(sqlite.prepare("SELECT draft_revision FROM cms_site_themes WHERE site_id=?").get(first.site_id).draft_revision, 2);
    // Theme Store changes must reach the same cms_activity_log table as D1:
    // never let a missing fixture table masquerade as a healthy write.
    const auditEvents = sqlite.prepare(
      "SELECT action,resource_type,resource_id,details_json FROM cms_activity_log WHERE site_id=? ORDER BY created_at,id"
    ).all(first.site_id);
    assert.ok(auditEvents.some(event => event.action === "theme.draft.created"));
    const draftSaved = auditEvents.find(event => event.action === "theme.draft.saved");
    assert.ok(draftSaved, "saved theme must produce an activity-log event");
    assert.equal(draftSaved.resource_type, "theme-project");
    assert.equal(draftSaved.resource_id, first.project.id);
    assert.equal(JSON.parse(draftSaved.details_json).revision, 2);

    assert.equal((await call(`/api/admin/cms/theme-projects/${first.project.id}?site_id=${first.site_id}`, "GET", undefined, "acct-other")).status, 404);
    assert.equal((await call(`/api/admin/cms/theme-projects/x?site_id=site-live`, "DELETE")).status, 409);
    // A URL forged with another project ID cannot archive this entire site.
    assert.equal((await call(`/api/admin/cms/theme-projects/not_this_project?site_id=${first.site_id}`, "DELETE")).status, 404);
    assert.equal(sqlite.prepare("SELECT status FROM cms_sites WHERE id=?").get(first.site_id).status, "draft");
    assert.equal((await call(`/api/admin/cms/theme-projects/${first.project.id}?site_id=${first.site_id}`, "DELETE")).status, 200);
    assert.equal(sqlite.prepare("SELECT status FROM cms_sites WHERE id=?").get(first.site_id).status, "archived");
    assert.equal(sqlite.prepare("SELECT status FROM cms_sites WHERE id='site-live'").get().status, "active");
    assert.equal((await (await call("/api/admin/cms/theme-projects", "GET")).json()).drafts.length, 1);
  } finally { sqlite.close(); }
});

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
    const primaryProjects=(await primaryList.json()).projects;
    assert.equal(primaryProjects.length,0,
      'read-only listing of an unrelated site must not install a Heuristic starter');

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
    assert.deepEqual(revisions.map(row => row.site_id), ["site-a2"],
      'only the site being edited receives revision records');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_globals WHERE site_id='site-a2' AND global_type='theme-project'").get().n,1);

    const crossAccount = await handleAdminCmsApi(
      request("/api/admin/cms/theme-projects/theme_resolve?site_id=site-a2"), env,
      new URL("https://cms.test/api/admin/cms/theme-projects/theme_resolve?site_id=site-a2"), { accountId: "acct-other" },
    );
    assert.equal(crossAccount.status, 404);

    sqlite.prepare("UPDATE cms_globals SET status='archived' WHERE site_id='site-a2' AND global_key='theme-project:theme_resolve'").run();
    const archivedList = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects?site_id=site-a2'), env,
      new URL('https://cms.test/api/admin/cms/theme-projects?site_id=site-a2'), { accountId: 'acct-a' },
    );
    assert.equal((await archivedList.json()).projects.length, 0);
    const archivedRead = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects/theme_resolve?site_id=site-a2'), env,
      new URL('https://cms.test/api/admin/cms/theme-projects/theme_resolve?site_id=site-a2'), { accountId: 'acct-a' },
    );
    assert.equal(archivedRead.status, 404);
  } finally { sqlite.close(); }
});

test("new Theme Studio projects are created only inside the explicitly selected owned site", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    sqlite.exec("INSERT INTO accounts(id) VALUES ('acct-a'),('acct-other'); INSERT INTO cms_sites(id,account_id,name,slug,status,is_default,settings_json) VALUES ('site-live','acct-a','Live','default','active',1,'{}'),('site-other','acct-other','Other','other','active',1,'{}');");
    const draft = project('New theme');
    draft.id = 'theme_new_theme';
    const created = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects', 'POST', { site_id:'site-live', project:draft }),
      env,
      new URL('https://cms.test/api/admin/cms/theme-projects?site_id=site-live'),
      { accountId:'acct-a' },
    );
    assert.equal(created.status, 201);
    const result = await created.json();
    assert.equal(result.ok, true);
    assert.equal(result.project.id, 'theme_new_theme');
    assert.equal(sqlite.prepare("SELECT site_id FROM cms_globals WHERE account_id='acct-a' AND global_key='theme-project:theme_new_theme' AND global_type='theme-project'").get().site_id, 'site-live');

    const forged = project('Wrong site');
    forged.id = 'theme_wrong_site';
    const rejected = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects', 'POST', { site_id:'site-other', project:forged }),
      env,
      new URL('https://cms.test/api/admin/cms/theme-projects?site_id=site-other'),
      { accountId:'acct-a' },
    );
    assert.equal(rejected.status, 404);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM cms_site_themes WHERE account_id='acct-other' AND site_id='site-other'").get().n, 0);
  } finally { sqlite.close(); }
});
