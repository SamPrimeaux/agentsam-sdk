import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createProjectSitePage, updateProjectSitePage } from "../backend/cms/project-site-page-adapter.mjs";

function d1(db) {
  return { prepare(sql) {
    let args = [];
    const stmt = {
      bind(...values) { args = values; return stmt; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async run() { return { meta: { changes: db.prepare(sql).run(...args).changes } }; },
    };
    return stmt;
  }};
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    INSERT INTO accounts VALUES ('alice'),('bob');
    CREATE TABLE cms_sites (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      name TEXT, slug TEXT, primary_domain TEXT, status TEXT, is_default INTEGER
    );
    INSERT INTO cms_sites VALUES
      ('site_alpha','alice','Alpha','alpha',NULL,'active',1),
      ('site_empty','alice','Empty','empty',NULL,'active',0),
      ('site_beta','bob','Beta','beta',NULL,'active',1);
    CREATE TABLE cms_pages (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_slug TEXT NOT NULL,
      site_id TEXT NOT NULL REFERENCES cms_sites(id),
      slug TEXT NOT NULL, path TEXT NOT NULL, route_path TEXT NOT NULL,
      page_type TEXT NOT NULL CHECK(page_type IN ('home','custom')),
      title TEXT NOT NULL, status TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      nav_visible INTEGER NOT NULL DEFAULT 1, is_homepage INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT DEFAULT '{}', template_sku TEXT,
      UNIQUE(project_id,slug), UNIQUE(project_id,route_path)
    );
    INSERT INTO cms_pages(id,project_id,project_slug,site_id,slug,path,route_path,page_type,title,status,created_at,updated_at)
      VALUES
      ('home_a','proj_alpha','alpha','site_alpha','home','/','/','home','Alpha home','published',1700000000,1700000000),
      ('about_a','proj_alpha','alpha','site_alpha','about','/about','/about','custom','Alpha about','published',1700000000,1700000000),
      ('home_b','proj_beta','beta','site_beta','home','/','/','home','Beta home','published',1700000000,1700000000);
    CREATE TABLE cms_page_sections (
      id TEXT PRIMARY KEY, page_id TEXT NOT NULL, section_key TEXT,
      section_type TEXT, section_name TEXT, section_data TEXT, sort_order INTEGER,
      is_visible INTEGER, r2_bucket TEXT DEFAULT 'cms',
      draft_r2_key TEXT, published_r2_key TEXT, updated_at TEXT
    );
    CREATE TABLE cms_revisions (
      account_id TEXT, site_id TEXT, entity_type TEXT, entity_id TEXT,
      revision_number INTEGER, revision_kind TEXT, content_object_key TEXT
    );
  `);
  return db;
}

test("a new CMS page uses the established project identity, not the site's id", async () => {
  const db = fixture();
  try {
    const env = { DB: d1(db) };
    const created = await createProjectSitePage(env, "alice", "site_alpha",
      { title: "Our Journal", slug: "journal" });
    assert.equal(created.ok, true, JSON.stringify(created));
    const row = db.prepare("SELECT project_id,project_slug,site_id,status FROM cms_pages WHERE id=?")
      .get(created.page.id);
    assert.deepEqual({ ...row }, { project_id:"proj_alpha",project_slug:"alpha",
      site_id:"site_alpha",status:"draft" });
    const updated = await updateProjectSitePage(env, "alice", "journal",
      "site_alpha", created.page.id, { title:"Latest Stories" });
    assert.equal(updated.ok, true, JSON.stringify(updated));
    assert.equal(db.prepare("SELECT title FROM cms_pages WHERE id=?").get(created.page.id).title,
      "Latest Stories");
    assert.equal((await createProjectSitePage(env,"alice","site_alpha",
      { title:"Duplicate", slug:"journal" })).status,409);
    assert.equal((await createProjectSitePage(env,"bob","site_alpha",
      { title:"Wrong owner", slug:"nope" }).catch(e => ({error:String(e)}))).ok,undefined);
    assert.equal(db.prepare("SELECT title FROM cms_pages WHERE id='home_a'").get().title,"Alpha home");
  } finally { db.close(); }
});

test("an empty new site uses its own identity without borrowing another site's project", async () => {
  const db = fixture();
  try {
    const created = await createProjectSitePage({ DB: d1(db) }, "alice", "site_empty",
      { title:"Welcome", slug:"welcome" });
    assert.equal(created.ok,true,JSON.stringify(created));
    const row = db.prepare("SELECT project_id,project_slug,site_id,status FROM cms_pages WHERE id=?")
      .get(created.page.id);
    assert.deepEqual({ ...row }, {project_id:"site_empty",project_slug:"empty",
      site_id:"site_empty",status:"draft"});
  } finally { db.close(); }
});

test("ambiguous legacy project identities are never selected arbitrarily", async () => {
  const db = fixture();
  try {
    const env = { DB: d1(db) };
    db.exec(`
      INSERT INTO cms_pages(id,project_id,project_slug,site_id,slug,path,route_path,page_type,title,status,created_at,updated_at)
        VALUES
        ('legacy_first','legacy_one','empty','site_empty','first','/first','/first','custom','First','draft',1700000000,1700000000),
        ('legacy_second','legacy_two','empty','site_empty','second','/second','/second','custom','Second','draft',1700000000,1700000000);
    `);
    const blocked = await createProjectSitePage(env, "alice", "site_empty",
      { title:"New page", slug:"new-page" });
    assert.equal(blocked.status,409);
    assert.equal(db.prepare("SELECT count(*) n FROM cms_pages WHERE site_id='site_empty'").get().n,2);
    db.prepare("UPDATE cms_pages SET is_homepage=1 WHERE id='legacy_second'").run();
    const created = await createProjectSitePage(env, "alice", "site_empty",
      { title:"New page", slug:"new-page" });
    assert.equal(created.ok,true,JSON.stringify(created));
    assert.equal(db.prepare("SELECT project_id FROM cms_pages WHERE id=?").get(created.page.id).project_id,
      "legacy_two");
  } finally { db.close(); }
});
