import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { preSiteSchema, siteFirstMigration, stub } from "./cms-schema.mjs";
import { migrateCmsSiteFirst } from "../db/schema/migrations/cms-site-first.mjs";

function wrap(db) {
  return {
    exec(sql) { db.exec(sql); },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async first(sql, params = []) { return db.prepare(sql).get(...params) || null; },
    async run(sql, params = []) { return db.prepare(sql).run(...params); },
  };
}

function seededLegacyCmsDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(stub + "\n" + preSiteSchema);
  db.exec(`
    INSERT INTO accounts(id) VALUES ('acct-a'),('acct-b');
    INSERT INTO cms_pages(id,account_id,legacy_page_id,slug,title,status) VALUES
      ('page-a-home','acct-a',1,'home','A Home','published'),
      ('page-a-about','acct-a',2,'about','A About','draft'),
      ('page-b-home','acct-b',3,'home','B Home','published'),
      ('page-a-index','acct-a',4,'index','A Index','draft');
    INSERT INTO cms_page_sections(id,account_id,page_id,legacy_section_id,section_key,section_type,sort_order,status,inline_content_json,content_r2_key)
      VALUES ('section-a','acct-a','page-a-home',11,'hero','hero',0,'draft','{"headline":"A"}','r2/a/hero.json');
    INSERT INTO cms_section_blocks(id,account_id,section_id,block_key,block_type,content_json)
      VALUES ('block-a','acct-a','section-a','headline','heading','{"text":"Hello"}');
    INSERT INTO cms_artifacts(id,account_id,artifact_key,artifact_type,version,r2_prefix,manifest_r2_key,content_hash,content_mode,status)
      VALUES ('artifact-a','acct-a','theme/default','theme','1','r2/prefix/','r2/manifest.json','hash-a','manifest','ready');
    INSERT INTO cms_globals(id,account_id,global_key,global_type,inline_content_json,content_r2_key)
      VALUES ('global-a','acct-a','theme','theme','{}','r2/global.json');
    INSERT INTO cms_revisions(id,account_id,entity_type,entity_id,revision_number,revision_kind,content_r2_key,snapshot_json)
      VALUES ('revision-page','acct-a','page','page-a-home',1,'history','r2/rev.json','{}'),
             ('revision-block','acct-a','block','block-a',1,'history',NULL,'{}'),
             ('revision-global','acct-a','global','global-a',1,'history',NULL,'{}');
  `);
  return db;
}

function seededSiteFirstWithLegacyNavigationDb() {
  const db = seededLegacyCmsDb();
  db.exec(siteFirstMigration);
  const siteId = db.prepare("SELECT id FROM cms_sites WHERE account_id='acct-a' AND is_default=1").get().id;
  db.exec(`
    DROP TABLE cms_navigation_menus;
    CREATE TABLE cms_navigation_menus (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      project_slug TEXT NOT NULL,
      menu_name TEXT NOT NULL,
      menu_type TEXT NOT NULL,
      menu_items TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      site_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id) REFERENCES cms_sites(id)
    );
    CREATE UNIQUE INDEX idx_cms_navigation_menus_project_name ON cms_navigation_menus(project_id, menu_name);
    DROP TABLE cms_revisions;
    CREATE TABLE cms_revisions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      site_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('page','section','block','global')),
      entity_id TEXT NOT NULL,
      revision_number INTEGER NOT NULL DEFAULT 0,
      revision_kind TEXT NOT NULL DEFAULT 'current' CHECK (revision_kind IN ('current','history','published','draft','imported')),
      content_object_key TEXT,
      content_hash TEXT,
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (site_id, account_id) REFERENCES cms_sites(id, account_id) ON DELETE CASCADE
    );
    INSERT INTO cms_revisions(id,account_id,site_id,entity_type,entity_id,revision_number,revision_kind,snapshot_json,metadata_json)
      VALUES ('revision-page','acct-a','${siteId}','page','page-a-home',1,'history','{}','{}');
  `);
  const insertMenu = db.prepare(`INSERT INTO cms_navigation_menus
    (id,project_id,project_slug,menu_name,menu_type,menu_items,is_active,site_id)
    VALUES (?,?,?,?,?,?,?,?)`);
  insertMenu.run('nav-main','acct-a','acct-a','main','header',JSON.stringify([
    { key:'home', label:'Home', href:'/' },
  ]),1,siteId);
  insertMenu.run('nav-footer','acct-a','acct-a','footer','site_footer',JSON.stringify({
    schema:'iam.cms.footer-menu.v1',
    groups:[{key:'company',label:'Company',items:[{key:'about',label:'About',href:'/about'}]}],
  }),1,siteId);
  return db;
}

test("site-first migration preserves existing CMS identities and stored object references", async () => {
  const db = seededLegacyCmsDb();
  try {
    const result = await migrateCmsSiteFirst(wrap(db));
    assert.equal(result.migrated, true);
    const pages = db.prepare("SELECT id,account_id,site_id,legacy_page_id,route_path,is_homepage FROM cms_pages ORDER BY id").all();
    assert.equal(pages.length, 4);
    assert.ok(pages.every(row => row.site_id));
    assert.equal(pages.find(row => row.id === "page-a-home").route_path, "/");
    assert.equal(pages.find(row => row.id === "page-a-home").is_homepage, 1);
    assert.equal(pages.find(row => row.id === "page-a-index").route_path, "/index");
    assert.equal(pages.find(row => row.id === "page-a-index").is_homepage, 0);
    assert.equal(db.prepare("SELECT id,content_object_key FROM cms_page_sections").get().id, "section-a");
    assert.equal(db.prepare("SELECT content_object_key FROM cms_page_sections").get().content_object_key, "r2/a/hero.json");
    assert.equal(db.prepare("SELECT id,object_prefix,manifest_object_key FROM cms_artifacts").get().object_prefix, "r2/prefix/");
    assert.equal(db.prepare("SELECT id,site_id,content_object_key FROM cms_globals").get().id, "global-a");
    assert.equal(db.prepare("SELECT id,content_object_key FROM cms_revisions WHERE id='revision-page'").get().content_object_key, "r2/rev.json");
    assert.equal(db.prepare("SELECT id FROM cms_section_blocks WHERE id='block-a'").get().id, "block-a");
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_sites WHERE account_id='acct-a' AND is_default=1").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_sites WHERE account_id='acct-b' AND is_default=1").get().n, 1);
  } finally { db.close(); }
});

test("site-first migration is idempotent and refuses a partially migrated schema", async () => {
  const db = seededLegacyCmsDb();
  try {
    const adapter = wrap(db);
    assert.equal((await migrateCmsSiteFirst(adapter)).migrated, true);
    assert.deepEqual(await migrateCmsSiteFirst(adapter), { skipped: true, reason: "site_first_schema_complete" });
  } finally { db.close(); }

  const partial = new DatabaseSync(":memory:");
  try {
    partial.exec(stub + "\n" + preSiteSchema);
    partial.exec("CREATE TABLE cms_sites (id TEXT PRIMARY KEY)");
    await assert.rejects(migrateCmsSiteFirst(wrap(partial)), /already|partial|site_first/);
  } finally { partial.close(); }
});

test("migration SQL and runner remain one source of truth", async () => {
  const db = seededLegacyCmsDb();
  try {
    const direct = new DatabaseSync(":memory:");
    try {
      direct.exec(stub + "\n" + preSiteSchema);
      direct.exec(siteFirstMigration);
      const wrapped = wrap(db);
      await migrateCmsSiteFirst(wrapped);
      const names = database => database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name);
      assert.deepEqual(names(db), names(direct));
    } finally { direct.close(); }
  } finally { db.close(); }
});

test("site-first runner upgrades the already-site-scoped production navigation schema in place", async () => {
  const db = seededSiteFirstWithLegacyNavigationDb();
  try {
    const result = await migrateCmsSiteFirst(wrap(db));
    assert.equal(result.migrated, true);
    assert.equal(result.migration, 'cms-navigation-runtime');
    assert.equal(result.navigation.revisionsSeeded, 2);
    const main = db.prepare("SELECT account_id,site_id,handle,title,items_json,status FROM cms_navigation_menus WHERE id='nav-main'").get();
    assert.equal(main.account_id, 'acct-a');
    assert.equal(main.handle, 'main');
    assert.equal(main.status, 'active');
    assert.equal(JSON.parse(main.items_json)[0].label, 'Home');
    const footer = db.prepare("SELECT metadata_json FROM cms_navigation_menus WHERE id='nav-footer'").get();
    const metadata = JSON.parse(footer.metadata_json);
    assert.equal(metadata.legacyMenuItems.schema, 'iam.cms.footer-menu.v1');
    assert.equal(metadata.legacyMenuItems.groups[0].items[0].href, '/about');
    const revisions = db.prepare("SELECT entity_id,entity_type,revision_kind,snapshot_json FROM cms_revisions WHERE entity_type='navigation' ORDER BY entity_id").all();
    assert.equal(revisions.length, 2);
    assert.equal(revisions[0].revision_kind, 'published');
    const revisionByMenu = new Map(revisions.map(row => [row.entity_id, JSON.parse(row.snapshot_json)]));
    assert.equal(revisionByMenu.get('nav-footer').layout, 'grouped-footer');
    assert.equal(revisionByMenu.get('nav-main').layout, 'links');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_revisions WHERE id='revision-page'").get().n, 1);
    assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='cms_revisions'").get().sql, /'navigation'/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(await migrateCmsSiteFirst(wrap(db)), { skipped: true, reason: 'site_first_schema_complete' });
  } finally { db.close(); }
});
