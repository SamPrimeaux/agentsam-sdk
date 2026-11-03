import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createSiteOwnedPage, updateSiteOwnedPage } from "../backend/cms/site-owned-page-adapter.mjs";

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
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES cms_sites(id),
      slug TEXT NOT NULL, route_path TEXT NOT NULL,
      page_type TEXT NOT NULL CHECK(page_type IN (
        'home','about','services','work','case_study','contact','pricing','privacy',
        'terms','faq','product','collection','blog','post','landing','portal',
        'dashboard','auth','sitemap','custom'
      )),
      title TEXT NOT NULL, description TEXT,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft','published','archived','scheduled')),
      seo_title TEXT, meta_description TEXT, canonical_url TEXT, robots TEXT,
      og_image_asset_id TEXT, r2_bucket TEXT, r2_key TEXT, r2_url TEXT,
      content_type TEXT DEFAULT 'text/html', content_size_bytes INTEGER DEFAULT 0,
      config_json TEXT DEFAULT '{}', seo_json TEXT DEFAULT '{}',
      analytics_json TEXT DEFAULT '{}', metadata_json TEXT DEFAULT '{}',
      is_system_page INTEGER DEFAULT 0, requires_auth INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      published_at INTEGER, archived_at INTEGER,
      nav_visible INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
      published_manifest_r2_key TEXT, template_sku TEXT,
      UNIQUE(site_id,slug), UNIQUE(site_id,route_path)
    );
    INSERT INTO cms_pages(id,site_id,slug,route_path,page_type,title,status,created_at,updated_at)
      VALUES
      ('home_a','site_alpha','home','/','home','Alpha home','published',1700000000,1700000000),
      ('about_a','site_alpha','about','/about','custom','Alpha about','published',1700000000,1700000000),
      ('home_b','site_beta','home','/','home','Beta home','published',1700000000,1700000000);
    CREATE TABLE cms_page_sections (
      id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
      section_key TEXT, section_type TEXT, section_name TEXT, section_data TEXT,
      sort_order INTEGER, is_visible INTEGER
    );
  `);
  return db;
}

test("page creation is owned by site_id, not a duplicated project identity", async () => {
  const db = fixture();
  try {
    const env = { DB: d1(db) };
    const created = await createSiteOwnedPage(env, "alice", "site_alpha",
      {
        title: "Our Journal", slug: "journal", page_type: "standard",
        description: "A journal for the community",
        meta_description: "Community stories and updates",
        seo_title: "Our Journal | Alpha",
        canonical_url: "https://alpha.example/journal",
        robots: "index,follow", nav_visible: false, requires_auth: true,
        template_sku: null, sort_order: 25,
        seo: { title: "Our Journal", social: { image: "journal-cover" } },
        metadata: { origin: "admin-create" },
      });
    assert.equal(created.ok, true, JSON.stringify(created));
    const row = db.prepare("SELECT site_id,slug,route_path,page_type,status FROM cms_pages WHERE id=?")
      .get(created.page.id);
    assert.deepEqual({ ...row }, {
      site_id: "site_alpha", slug: "journal", route_path: "/journal",
      page_type: "custom", status: "draft",
    });
    const updated = await updateSiteOwnedPage(env, "alice", "journal",
      "site_alpha", created.page.id, { title: "Latest Stories", slug: "stories" });
    assert.equal(updated.ok, true, JSON.stringify(updated));
    assert.equal(updated.page.title, "Latest Stories");
    assert.equal(updated.page.route_path, "/stories");
    assert.equal(created.page.description, "A journal for the community");
    assert.equal(created.page.meta_description, "Community stories and updates");
    assert.equal(created.page.seo_title, "Our Journal | Alpha");
    assert.equal(created.page.nav_visible, false);
    assert.equal(created.page.requires_auth, true);
    assert.equal(created.page.sort_order, 25);
    assert.deepEqual(created.page.seo, { title: "Our Journal", social: { image: "journal-cover" } });
    assert.deepEqual(created.page.metadata, { origin: "admin-create" });
    assert.equal(db.prepare("SELECT route_path FROM cms_pages WHERE id=?").get(created.page.id).route_path,
      "/stories");
    assert.equal((await createSiteOwnedPage(env,"alice","site_alpha",
      { title:"Duplicate", slug:"stories" })).status,409);
    await assert.rejects(createSiteOwnedPage(env,"bob","site_alpha",
      { title:"Wrong owner", slug:"nope" }));
    assert.equal(db.prepare("SELECT title FROM cms_pages WHERE id='home_a'").get().title,"Alpha home");
  } finally { db.close(); }
});

test("the same slug and root route can exist on different sites", async () => {
  const db = fixture();
  try {
    const created = await createSiteOwnedPage({ DB: d1(db) }, "alice", "site_empty",
      { title:"Welcome", slug:"home", route_path:"/", page_type:"home" });
    assert.equal(created.ok,true,JSON.stringify(created));
    assert.equal(created.page.site_id,"site_empty");
    assert.equal(created.page.is_homepage,true);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cms_pages WHERE slug='home'").get().n,3);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM cms_pages WHERE route_path='/'").get().n,3);
  } finally { db.close(); }
});

test("the site-owned schema has no project, duplicate path, or homepage-flag columns", () => {
  const db = fixture();
  try {
    const columns = db.prepare("PRAGMA table_info(cms_pages)").all().map(row => row.name);
    for (const removed of ["project_id", "project_slug", "workspace_id", "worker_id",
      "person_uuid", "path", "is_homepage", "is_active"]) {
      assert.equal(columns.includes(removed), false, removed + " must not be part of cms_pages");
    }
    assert.ok(columns.includes("site_id"));
    assert.ok(columns.includes("route_path"));
    assert.ok(columns.includes("is_system_page"), "system-page semantics are retained");
    assert.ok(columns.includes("requires_auth"), "page access policy is retained");
  } finally { db.close(); }
});
