import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrateCmsNavigationRuntime } from "../db/schema/migrations/cms-navigation-runtime.mjs";

function wrap(db) {
  return {
    exec(sql) { db.exec(sql); },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async first(sql, params = []) { return db.prepare(sql).get(...params) || null; },
    async run(sql, params = []) { return db.prepare(sql).run(...params); },
  };
}

function legacyDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    CREATE TABLE cms_sites (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL,
      UNIQUE(id,account_id)
    );
    CREATE TABLE cms_navigation_menus (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_slug TEXT,
      menu_name TEXT NOT NULL, menu_type TEXT DEFAULT 'site', menu_items TEXT NOT NULL,
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')), site_id TEXT NOT NULL REFERENCES cms_sites(id),
      UNIQUE(project_id,menu_name)
    );
    CREATE TABLE cms_revisions (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), site_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('page','section','block','global')),
      entity_id TEXT NOT NULL, revision_number INTEGER NOT NULL DEFAULT 0,
      revision_kind TEXT NOT NULL DEFAULT 'current' CHECK(revision_kind IN ('current','history','published','draft','imported')),
      content_object_key TEXT, content_hash TEXT, snapshot_json TEXT NOT NULL DEFAULT '{}',
      metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key),
      FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE
    );
    CREATE INDEX idx_cms_revisions_entity ON cms_revisions(site_id,entity_type,entity_id,revision_number DESC);
    INSERT INTO accounts VALUES ('acct-a');
    INSERT INTO cms_sites VALUES ('site-a','acct-a','Example');
    INSERT INTO cms_navigation_menus (id,project_id,project_slug,menu_name,menu_type,menu_items,is_active,site_id)
      VALUES ('menu-main','site-a','example','Main Menu','site','[{"label":"Home","path":"/"}]',1,'site-a');
    INSERT INTO cms_navigation_menus (id,project_id,project_slug,menu_name,menu_type,menu_items,is_active,site_id)
      VALUES ('menu-footer','site-a','example','Footer Menu','site_footer','{"groups":[{"title":"Company","links":[]}]}',1,'site-a');
    INSERT INTO cms_revisions (id,account_id,site_id,entity_type,entity_id,revision_number,revision_kind,snapshot_json)
      VALUES ('rev-page','acct-a','site-a','page','home',1,'history','{}');
  `);
  return db;
}

test("navigation runtime migration adds canonical site-owned fields and preserves legacy payloads", async () => {
  const db = legacyDatabase();
  try {
    const result = await migrateCmsNavigationRuntime(wrap(db));
    assert.equal(result.migrated, true);
    assert.deepEqual(result.columnsAdded, ["account_id", "handle", "title", "items_json", "status", "metadata_json"]);
    const main = db.prepare("SELECT account_id,handle,title,items_json,status,metadata_json,menu_items FROM cms_navigation_menus WHERE id='menu-main'").get();
    assert.equal(main.account_id, "acct-a");
    assert.equal(main.handle, "main-menu");
    assert.equal(main.title, "Main Menu");
    assert.deepEqual(JSON.parse(main.items_json), [{ label: "Home", path: "/" }]);
    assert.equal(main.status, "active");
    const footer = db.prepare("SELECT items_json,metadata_json,menu_items FROM cms_navigation_menus WHERE id='menu-footer'").get();
    assert.deepEqual(JSON.parse(footer.items_json), []);
    assert.deepEqual(JSON.parse(footer.metadata_json).legacyMenuItems, { groups: [{ title: "Company", links: [] }] });
    assert.equal(footer.menu_items, '{"groups":[{"title":"Company","links":[]}]}');
    assert.doesNotThrow(() => db.prepare("INSERT INTO cms_revisions (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,snapshot_json) VALUES ('acct-a','site-a','navigation','menu-main',1,'draft','{}')").run());
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(await migrateCmsNavigationRuntime(wrap(db)), {
      migrated: false, columnsAdded: [], menusBackfilled: 2, revisionsExtended: false, revisionsSeeded: 0,
    });
  } finally { db.close(); }
});

test("canonical navigation schema is left intact and navigation revisions remain supported", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY);
      CREATE TABLE cms_sites (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, UNIQUE(id,account_id));
      CREATE TABLE cms_navigation_menus (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, site_id TEXT NOT NULL,
        handle TEXT NOT NULL, title TEXT NOT NULL, items_json TEXT NOT NULL,
        status TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(site_id,handle), FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id)
      );
      CREATE TABLE cms_revisions (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, site_id TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK(entity_type IN ('page','section','block','global','navigation')),
        entity_id TEXT NOT NULL, revision_number INTEGER NOT NULL DEFAULT 0,
        revision_kind TEXT NOT NULL DEFAULT 'current' CHECK(revision_kind IN ('current','history','published','draft','imported')),
        content_object_key TEXT, content_hash TEXT, snapshot_json TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key),
        FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id)
      );
    `);
    const result = await migrateCmsNavigationRuntime(wrap(db));
    assert.equal(result.migrated, false);
    assert.deepEqual(result.columnsAdded, []);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('cms_navigation_menus')").get().n, 10);
  } finally { db.close(); }
});
