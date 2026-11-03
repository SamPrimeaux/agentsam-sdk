import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { listPagesAdmin, createPageAdmin, getPageAdminForSite, updatePageMetaForSite } from "../backend/cms/api.js";
import { cmsPageStorageMode } from "../backend/cms/page-inventory.mjs";

function d1(sqlite) {
  return {
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        async run() {
          const meta = sqlite.prepare(sql).run(...args);
          return { meta: { changes: meta.changes } };
        },
      };
      return stmt;
    },
  };
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE accounts(id TEXT PRIMARY KEY);
    INSERT INTO accounts(id) VALUES ('alice'), ('bob');
    CREATE TABLE cms_sites (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      name TEXT, slug TEXT, primary_domain TEXT, status TEXT DEFAULT 'active',
      is_default INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default)
      VALUES ('s-a','alice','A Store','store-a','active',1),
             ('s-a2','alice','A Second Store','store-2','active',0),
             ('s-empty','alice','New Store','new-store','active',0),
             ('s-b','bob','B Store','store-b','active',1);
    CREATE TABLE cms_pages (
      id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL REFERENCES cms_sites(id), slug TEXT NOT NULL,
      route_path TEXT NOT NULL, title TEXT NOT NULL,
      page_type TEXT NOT NULL CHECK(page_type IN ('home','about','custom','post','landing','product')),
      description TEXT, status TEXT NOT NULL DEFAULT 'draft', updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL, meta_description TEXT, seo_title TEXT,
      canonical_url TEXT, robots TEXT DEFAULT 'index,follow', og_image_asset_id TEXT,
      r2_bucket TEXT, r2_key TEXT, r2_url TEXT, content_type TEXT DEFAULT 'text/html',
      content_size_bytes INTEGER DEFAULT 0, config_json TEXT DEFAULT '{}',
      seo_json TEXT DEFAULT '{}', analytics_json TEXT DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}', is_system_page INTEGER DEFAULT 0,
      requires_auth INTEGER DEFAULT 0, nav_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0, published_at INTEGER, archived_at INTEGER,
      published_manifest_r2_key TEXT, template_sku TEXT,
      UNIQUE(site_id, slug), UNIQUE(site_id, route_path)
    );
    INSERT INTO cms_pages(id,site_id,slug,route_path,title,page_type,status,updated_at,created_at)
      VALUES ('pa','s-a','home','/','Alice Home','home','published',1700000000,1700000000),
             ('p2','s-a2','about','/about','Alice About','about','draft',1700000000,1700000000),
             ('pb','s-b','home','/','Bob Home','home','published',1700000000,1700000000);
    CREATE TABLE cms_page_sections (
      id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES cms_pages(id),
      section_key TEXT,section_type TEXT,section_name TEXT,section_data TEXT,
      sort_order INTEGER DEFAULT 0,is_visible INTEGER DEFAULT 1
    );
    INSERT INTO cms_page_sections(id,page_id,section_key,section_type,section_name,section_data,is_visible)
      VALUES ('hero-a','pa','hero','hero','Hero','{"headline":"Hello Alice"}',1),
             ('hidden-a','pa','aside','aside','Aside','{"headline":"Hidden"}',0),
             ('hero-b','pb','hero','hero','Hero','{"headline":"Hello Bob"}',1);
  `);
  return db;
}

test("site-owned production pages are visible only inside their authorized CMS site", async () => {
  const sql = fixture();
  try {
    const env = { DB: d1(sql) };
    assert.equal(await cmsPageStorageMode(env.DB), "site-owned");
    const alice = await listPagesAdmin(env, "alice", "s-a");
    assert.deepEqual(alice.pages.map(x => x.title), ["Alice Home"]);
    assert.equal(alice.pages[0].section_count, 2); // includes hidden sections for editor inventory
    assert.equal(alice.pages[0].preview, "Hello Alice");
    const second = await listPagesAdmin(env, "alice", "s-a2");
    assert.deepEqual(second.pages.map(x => x.title), ["Alice About"]);
    await assert.rejects(listPagesAdmin(env, "bob", "s-a"), /not_found/);
    const details = await getPageAdminForSite(env, "alice", "home", "s-a", "pa");
    assert.equal(details.page.sections.length, 2);
    assert.equal(details.page.sections[0].content.headline, "Hello Alice");
    assert.equal(await getPageAdminForSite(env, "bob", "home", "s-b", "pa"), null);
  } finally { sql.close(); }
});

test("new page creation and draft updates operate on the existing table without publishing", async () => {
  const sql = fixture();
  try {
    const env = { DB: d1(sql) };
    const created = await createPageAdmin(env,"alice","s-a",{
      title:"Our Journal",slug:"journal",page_type:"standard"
    });
    assert.equal(created.ok,true,JSON.stringify(created));
    assert.equal(created.page.status,"draft");
    assert.equal(created.page.site_id,"s-a");
    const inserted = sql.prepare("SELECT site_id, page_type, status FROM cms_pages WHERE id=?")
      .get(created.page.id);
    assert.deepEqual({ ...inserted }, {
      site_id: "s-a", page_type: "custom", status: "draft"
    }, "new pages must be owned by the canonical site id");
    const updated=await updatePageMetaForSite(env,"alice","journal","s-a",created.page.id,{
      title:"Journal and Stories"
    });
    assert.equal(updated.ok,true,JSON.stringify(updated));
    assert.equal(updated.page.title,"Journal and Stories");
    assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM cms_pages WHERE site_id='s-a'").get().n,2);
    assert.equal((await createPageAdmin(env,"alice","s-a",{
      title:"Duplicate",slug:"journal"})).status,409);
    assert.equal((await updatePageMetaForSite(env,"alice","home","s-a","pa",{
      title:"Mutate live!"})).status,409);
    assert.equal((await updatePageMetaForSite(env,"bob","journal","s-b",created.page.id,{
      title:"Access another merchant!"})).status,404);
    assert.equal(sql.prepare("SELECT title FROM cms_pages WHERE id='pa'").get().title,"Alice Home");
    assert.equal(sql.prepare("SELECT status FROM cms_pages WHERE id=?").get(created.page.id).status,"draft");
  } finally { sql.close(); }
});


test("legacy project columns are detected and page creation is gated until migration", async () => {
  const sql = fixture();
  try {
    sql.exec("ALTER TABLE cms_pages ADD COLUMN project_id TEXT; ALTER TABLE cms_pages ADD COLUMN project_slug TEXT;");
    const env = { DB: d1(sql) };
    assert.equal(await cmsPageStorageMode(env.DB), "site-owned-legacy");
    const inventory = await listPagesAdmin(env, "alice", "s-a");
    assert.deepEqual(inventory.pages.map(page => page.title), ["Alice Home"]);
    const blocked = await createPageAdmin(env, "alice", "s-a", {
      title: "New page", slug: "new-page",
    });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.error, "cms_site_identity_migration_required");
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM cms_pages WHERE site_id='s-a'").get().n, 1);
  } finally { sql.close(); }
});
