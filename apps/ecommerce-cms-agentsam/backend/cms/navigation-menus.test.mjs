import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrateCmsNavigationRuntime } from "../../db/schema/migrations/cms-navigation-runtime.mjs";
import {
  listCmsNavigationMenus,
  createCmsNavigationMenu,
  updateCmsNavigationMenu,
  archiveCmsNavigationMenu,
  listCmsNavigationRevisions,
  loadPrimaryCmsNavigation,
} from "./navigation-menus.mjs";

function migrationAdapter(db) {
  return {
    exec(sql) { db.exec(sql); },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async first(sql, params = []) { return db.prepare(sql).get(...params) || null; },
    async run(sql, params = []) { return db.prepare(sql).run(...params); },
  };
}

function d1Adapter(db) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async all() { return { results: db.prepare(sql).all(...params) }; },
        async first() { return db.prepare(sql).get(...params) || null; },
        async run() {
          const result = db.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
        },
      };
      return statement;
    },
  };
}

function seededDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;\n" +
    "CREATE TABLE accounts (id TEXT PRIMARY KEY);\n" +
    "CREATE TABLE cms_sites (id TEXT PRIMARY KEY, account_id TEXT NOT NULL, slug TEXT, UNIQUE(id,account_id));\n" +
    "CREATE TABLE cms_navigation_menus (\n" +
    "id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),\n" +
    "project_id TEXT NOT NULL, project_slug TEXT, menu_name TEXT NOT NULL,\n" +
    "menu_type TEXT DEFAULT 'site', menu_items TEXT NOT NULL, is_active INTEGER DEFAULT 1,\n" +
    "created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),\n" +
    "site_id TEXT NOT NULL REFERENCES cms_sites(id), UNIQUE(project_id,menu_name));\n" +
    "CREATE TABLE cms_revisions (\n" +
    "id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), site_id TEXT NOT NULL,\n" +
    "entity_type TEXT NOT NULL CHECK(entity_type IN ('page','section','block','global')),\n" +
    "entity_id TEXT NOT NULL, revision_number INTEGER NOT NULL DEFAULT 0,\n" +
    "revision_kind TEXT NOT NULL DEFAULT 'current' CHECK(revision_kind IN ('current','history','published','draft','imported')),\n" +
    "content_object_key TEXT, content_hash TEXT, snapshot_json TEXT NOT NULL DEFAULT '{}',\n" +
    "metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')),\n" +
    "UNIQUE(site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key),\n" +
    "FOREIGN KEY(site_id,account_id) REFERENCES cms_sites(id,account_id) ON DELETE CASCADE);\n" +
    "CREATE INDEX idx_cms_revisions_entity ON cms_revisions(site_id,entity_type,entity_id,revision_number DESC);\n" +
    "INSERT INTO accounts VALUES ('acct-a');\n" +
    "INSERT INTO cms_sites VALUES ('site-a','acct-a','example');\n" +
    "INSERT INTO cms_navigation_menus (id,project_id,project_slug,menu_name,menu_type,menu_items,is_active,site_id)\n" +
    "VALUES ('main-menu','example','example','main','site','[{\"label\":\"Home\",\"href\":\"/\"}]',1,'site-a');\n" +
    "INSERT INTO cms_navigation_menus (id,project_id,project_slug,menu_name,menu_type,menu_items,is_active,site_id)\n" +
    "VALUES ('footer-menu','example','example','footer','site_footer','{\"schema\":\"iam.cms.footer-menu.v1\",\"groups\":[{\"key\":\"company\",\"label\":\"Company\",\"items\":[{\"label\":\"About\",\"href\":\"/about\"}]}]}',1,'site-a');");
  return db;
}

test("CMS navigation CRUD uses the existing site menu table and records revisions", async () => {
  const db = seededDatabase();
  try {
    await migrateCmsNavigationRuntime(migrationAdapter(db));
    const adapter = d1Adapter(db);
    const site = { id: "site-a", account_id: "acct-a", slug: "example" };

    const listed = await listCmsNavigationMenus(adapter, site);
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.menus.map(menu => menu.handle), ["footer", "main"]);
    const footer = listed.menus.find(menu => menu.handle === "footer");
    assert.equal(footer.layout, "grouped-footer");
    assert.equal(footer.read_only, false);
    assert.equal(footer.groups[0].items[0].href, "/about");

    const primary = await loadPrimaryCmsNavigation(adapter, site);
    assert.deepEqual(primary, [{ id: "nav-1", label: "Home", href: "/" }]);

    const created = await createCmsNavigationMenu(adapter, site, {
      handle: "resources", title: "Resources", status: "draft",
      items: [{ label: "Docs", href: "/docs" }],
    });
    assert.equal(created.ok, true);
    assert.equal(created.menu.handle, "resources");
    assert.equal(created.menu.items[0].href, "/docs");

    const updated = await updateCmsNavigationMenu(adapter, site, created.menu.id, {
      expected_updated_at: created.menu.updated_at,
      handle: "resources", title: "Resources", status: "active",
      items: [{ label: "Docs", href: "/docs" }, { label: "Help", href: "https://help.example.com" }],
    });
    assert.equal(updated.ok, true);
    assert.equal(updated.menu.status, "active");
    assert.equal(updated.menu.items.length, 2);

    const conflict = await updateCmsNavigationMenu(adapter, site, created.menu.id, {
      expected_updated_at: created.menu.updated_at,
      handle: "resources", title: "Resources", status: "active",
      items: [{ label: "Wrong", href: "/wrong" }],
    });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.error, "navigation_menu_conflict");

    const revisions = await listCmsNavigationRevisions(adapter, site, created.menu.id);
    assert.equal(revisions.ok, true);
    assert.ok(revisions.revisions.some(revision => revision.revision_kind === "draft"));
    assert.ok(revisions.revisions.some(revision => revision.revision_kind === "history"));

    const archived = await archiveCmsNavigationMenu(adapter, site, created.menu.id, updated.menu.updated_at);
    assert.equal(archived.ok, true);
    assert.equal(archived.menu.status, "archived");
  } finally { db.close(); }
});

test("navigation menu writes reject unsafe links and preserve grouped footer payloads", async () => {
  const db = seededDatabase();
  try {
    await migrateCmsNavigationRuntime(migrationAdapter(db));
    const adapter = d1Adapter(db);
    const site = { id: "site-a", account_id: "acct-a", slug: "example" };
    const unsafe = await createCmsNavigationMenu(adapter, site, {
      handle: "unsafe", title: "Unsafe", items: [{ label: "Bad", href: "javascript:alert(1)" }],
    });
    assert.equal(unsafe.ok, false);
    assert.equal(unsafe.status, 400);

    const footer = (await listCmsNavigationMenus(adapter, site)).menus.find(menu => menu.handle === "footer");
    const updated = await updateCmsNavigationMenu(adapter, site, footer.id, {
      expected_updated_at: footer.updated_at, handle: "footer", title: "Footer",
      layout: "grouped-footer", status: "active",
      groups: [{ key: "company", label: "Company", items: [{ label: "Contact", href: "mailto:hello@example.com" }] }],
    });
    assert.equal(updated.ok, true);
    assert.equal(updated.menu.layout, "grouped-footer");
    assert.equal(updated.menu.groups[0].items[0].href, "mailto:hello@example.com");
    const legacy = db.prepare("SELECT menu_items FROM cms_navigation_menus WHERE id=?").get(footer.id);
    assert.equal(JSON.parse(legacy.menu_items).schema, "iam.cms.footer-menu.v1");
  } finally { db.close(); }
});

