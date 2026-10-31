import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { listCanonicalPageRows } from "../backend/cms/page-inventory.mjs";
import { resolveSingleCmsAccount } from "../backend/cms/studio-bridge.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE cms_sites (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL,
      slug TEXT NOT NULL, primary_domain TEXT, domain_aliases_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL, is_default INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT '2026-10-01'
    );
    CREATE TABLE cms_pages (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, site_id TEXT NOT NULL, legacy_page_id INTEGER,
      slug TEXT NOT NULL, route_path TEXT, title TEXT NOT NULL, status TEXT NOT NULL,
      updated_at TEXT NOT NULL, is_homepage INTEGER NOT NULL DEFAULT 0,
      nav_visible INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE cms_page_sections (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, page_id TEXT NOT NULL,
      section_key TEXT NOT NULL, status TEXT NOT NULL, sort_order INTEGER NOT NULL,
      inline_content_json TEXT NOT NULL
    );
    INSERT INTO cms_sites(id,account_id,name,slug,status,is_default) VALUES
      ('site-a','account-a','Account A','default','active',1),
      ('site-a2','account-a','Account A Second','second','active',0),
      ('site-b','account-b','Account B','default','active',1);
    INSERT INTO cms_pages(id,account_id,site_id,legacy_page_id,slug,route_path,title,status,updated_at,is_homepage) VALUES
      ('cms-home','account-a','site-a',1,'home','/','Home','draft','2026-10-27',1),
      ('cms-shop','account-a','site-a',2,'shop','/shop','Shop','published','2026-10-26',0),
      ('cms-second-home','account-a','site-a2',3,'home','/','Second Home','draft','2026-10-24',1),
      ('cms-private','account-b','site-b',NULL,'private','/private','Private','draft','2026-10-25',0);
    INSERT INTO cms_page_sections VALUES
      ('hero','account-a','cms-home','hero','draft',0,'{"headline":"Hello"}'),
      ('archived','account-a','cms-home','old','archived',1,'{}'),
      ('shop-hero','account-a','cms-shop','hero','published',0,'{"headline":"Shop"}'),
      ('second-hero','account-a','cms-second-home','hero','draft',0,'{"headline":"Second"}'),
      ('private-hero','account-b','cms-private','hero','draft',0,'{}');
  `);
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async first() { return sqlite.prepare(sql).get(...params) || null; },
          };
        },
      };
    },
  };
  return { db, sqlite };
}

test("page inventory is scoped to the account's default site and keeps legacy IDs as pointers", async () => {
  const { db, sqlite } = fixture();
  try {
    const rows = await listCanonicalPageRows(db, "account-a");
    assert.deepEqual(rows.map(row => row.id), ["cms-home", "cms-shop"]);
    assert.deepEqual(rows.map(row => row.legacy_page_id), [1, 2]);
    assert.deepEqual(rows.map(row => row.site_id), ["site-a", "site-a"]);
    assert.deepEqual(rows.map(row => row.section_count), [1, 1]);
    assert.equal(JSON.parse(rows[0].preview_json).headline, "Hello");
    assert.equal(rows[1].status, "published");
  } finally { sqlite.close(); }
});

test("site selection allows the same slug in another site without cross-site leakage", async () => {
  const { db, sqlite } = fixture();
  try {
    const rows = await listCanonicalPageRows(db, "account-a", "site-a2");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slug, "home");
    assert.equal(rows[0].title, "Second Home");
    const privateRows = await listCanonicalPageRows(db, "account-b");
    assert.equal(privateRows.length, 1);
    assert.equal(privateRows[0].slug, "private");
    await assert.rejects(listCanonicalPageRows(db, ""), /account_required/);
    await assert.rejects(listCanonicalPageRows(db, "account-a", "site-b"), /cms_site_not_found/);
  } finally { sqlite.close(); }
});

test("signed remote CMS account resolver refuses ambiguous D1 scope", async () => {
  const { sqlite } = fixture();
  const env = {
    DB: {
      prepare(sql) {
        return { async all() { return { results: sqlite.prepare(sql).all() }; } };
      },
    },
  };
  try {
    await assert.rejects(resolveSingleCmsAccount(env), /account_scope_ambiguous/);
    sqlite.exec("DELETE FROM cms_pages WHERE account_id = 'account-b'");
    assert.equal(await resolveSingleCmsAccount(env), "account-a");
  } finally { sqlite.close(); }
});
