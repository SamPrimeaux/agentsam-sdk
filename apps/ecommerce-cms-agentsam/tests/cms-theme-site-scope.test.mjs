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
      [request('/api/admin/cms/theme-projects'), '/api/admin/cms/theme-projects'],
      [request('/api/admin/cms/theme-projects', 'POST', { project: project() }), '/api/admin/cms/theme-projects'],
      [request('/api/admin/cms/theme-projects/theme_resolve'), '/api/admin/cms/theme-projects/theme_resolve'],
      [request('/api/admin/cms/theme-projects/theme_resolve', 'PUT', { project: project(), expected_version: 1 }), '/api/admin/cms/theme-projects/theme_resolve'],
      [request('/api/admin/cms/themes'), '/api/admin/cms/themes'],
      [request('/api/admin/cms/themes/plain-jane/install', 'POST', { version: '0.1.0' }), '/api/admin/cms/themes/plain-jane/install'],
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


test("Theme Studio drafts are account-owned and fully editable without creating a CMS site", async () => {
  const sqlite = createCmsTestDb();
  const env = environment(sqlite);
  try {
    sqlite.exec("INSERT INTO accounts(id) VALUES ('acct-a'),('acct-other')");
    const created = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects?scope=studio', 'POST', { project: project('Studio draft') }),
      env, new URL('https://cms.test/api/admin/cms/theme-projects?scope=studio'), { accountId: 'acct-a' },
    );
    assert.equal(created.status, 201);
    const createdData = await created.json();
    assert.equal(createdData.ok, true);
    assert.equal(createdData.project.revision, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_globals').get().n, 0);
    const row = sqlite.prepare("SELECT * FROM cms_theme_studio_projects WHERE account_id='acct-a'").get();
    assert.ok(row.content_object_key.includes('/studio/theme-projects/theme_resolve/'));
    assert.equal(row.content_version, 1);

    const listed = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects?scope=studio'), env,
      new URL('https://cms.test/api/admin/cms/theme-projects?scope=studio'), { accountId: 'acct-a' },
    );
    assert.equal((await listed.json()).projects[0].id, 'theme_resolve');

    const detail = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects/theme_resolve?scope=studio'), env,
      new URL('https://cms.test/api/admin/cms/theme-projects/theme_resolve?scope=studio'), { accountId: 'acct-a' },
    );
    assert.equal((await detail.json()).project.name, 'Studio draft');

    const changed = project('Edited before a site exists');
    const saved = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects/theme_resolve?scope=studio', 'PUT', {
        project: changed, expected_version: 1, scope: 'studio',
      }), env, new URL('https://cms.test/api/admin/cms/theme-projects/theme_resolve?scope=studio'), { accountId: 'acct-a' },
    );
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).project.revision, 2);

    const history = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects/theme_resolve/history?scope=studio'), env,
      new URL('https://cms.test/api/admin/cms/theme-projects/theme_resolve/history?scope=studio'), { accountId: 'acct-a' },
    );
    assert.deepEqual((await history.json()).revisions.map(item => Number(item.id)), [2, 1]);

    const crossAccount = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects/theme_resolve?scope=studio'), env,
      new URL('https://cms.test/api/admin/cms/theme-projects/theme_resolve?scope=studio'), { accountId: 'acct-other' },
    );
    assert.equal(crossAccount.status, 404);
    const ambiguous = await handleAdminCmsApi(
      request('/api/admin/cms/theme-projects?scope=studio&site_id=site-a'), env,
      new URL('https://cms.test/api/admin/cms/theme-projects?scope=studio&site_id=site-a'), { accountId: 'acct-a' },
    );
    assert.equal(ambiguous.status, 400);
    assert.equal((await ambiguous.json()).error, 'theme_project_scope_conflict');
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM cms_sites').get().n, 0);
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
