import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { listCanonicalPageRows } from "../backend/cms/page-inventory.mjs";
import { resolveSingleCmsAccount } from "../backend/cms/studio-bridge.js";

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE cms_pages (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, legacy_page_id INTEGER,
      slug TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE cms_page_sections (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL, page_id TEXT NOT NULL,
      section_key TEXT NOT NULL, status TEXT NOT NULL, sort_order INTEGER NOT NULL,
      inline_content_json TEXT NOT NULL
    );
    INSERT INTO cms_pages VALUES
      ('cms-home','account-a',1,'home','Home','draft','2026-10-27'),
      ('cms-shop','account-a',2,'shop','Shop','published','2026-10-26'),
      ('cms-private','account-b',NULL,'private','Private','draft','2026-10-25');
    INSERT INTO cms_page_sections VALUES
      ('hero','account-a','cms-home','hero','draft',0,'{"headline":"Hello"}'),
      ('archived','account-a','cms-home','old','archived',1,'{}'),
      ('shop-hero','account-a','cms-shop','hero','published',0,'{"headline":"Shop"}'),
      ('private-hero','account-b','cms-private','hero','draft',0,'{}');
  `);
  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return { async all() { return { results: sqlite.prepare(sql).all(...params) }; } };
        },
      };
    },
  };
  return { db, sqlite };
}

test("page inventory comes from canonical CMS tables and keeps legacy IDs as pointers", async () => {
  const { db, sqlite } = fixture();
  try {
    const rows = await listCanonicalPageRows(db, "account-a");
    assert.deepEqual(rows.map(row => row.id), ["cms-home", "cms-shop"]);
    assert.deepEqual(rows.map(row => row.legacy_page_id), [1, 2]);
    assert.deepEqual(rows.map(row => row.section_count), [1, 1]);
    assert.equal(JSON.parse(rows[0].preview_json).headline, "Hello");
    assert.equal(rows[1].status, "published");
  } finally { sqlite.close(); }
});

test("a site with only canonical records is listable without legacy tables", async () => {
  const { db, sqlite } = fixture();
  try {
    const rows = await listCanonicalPageRows(db, "account-b");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].legacy_page_id, null);
    assert.equal(rows[0].slug, "private");
    await assert.rejects(listCanonicalPageRows(db, ""), /account_required/);
  } finally { sqlite.close(); }
});
