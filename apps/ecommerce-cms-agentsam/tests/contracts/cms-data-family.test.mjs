import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb, seedCmsAccountAndSite } from "../cms-test-db.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFile(path.join(appRoot, relative), "utf8");

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(row => row.name);
}

test("the applied Ecommerce CMS migration chain produces one site-first content authority", () => {
  const db = createCmsTestDb();
  try {
    for (const table of [
      "cms_sites", "cms_pages", "cms_page_sections", "cms_section_blocks",
      "cms_revisions", "cms_globals", "cms_navigation_menus", "cms_publications", "cms_collections", "cms_collection_items",
    ]) {
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), `missing ${table}`);
    }
    assert.ok(columns(db, "cms_pages").includes("site_id"));
    assert.ok(columns(db, "cms_pages").includes("route_path"));
    assert.ok(columns(db, "cms_globals").includes("site_id"));
    assert.ok(columns(db, "cms_revisions").includes("site_id"));
    assert.ok(columns(db, "cms_page_sections").includes("content_object_key"));
    assert.ok(columns(db, "cms_artifacts").includes("object_prefix"));
    assert.ok(columns(db, "cms_artifacts").includes("manifest_object_key"));
    for (const [table, column] of [
      ["cms_page_sections", "content_r2_key"], ["cms_globals", "content_r2_key"],
      ["cms_revisions", "content_r2_key"], ["cms_artifacts", "r2_prefix"],
      ["cms_artifacts", "manifest_r2_key"],
    ]) assert.ok(!columns(db, table).includes(column), `${table}.${column} must be provider-neutral`);

    const forbidden = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'
      AND (name LIKE '%provider%registry%' OR name LIKE '%storage%resource%' OR name='account_cloudflare_resources')`).all();
    assert.deepEqual(forbidden, [], "provider/resource registries belong to AgentSam, not the CMS");
  } finally { db.close(); }
});

test("site ownership allows identical slugs across sites and blocks cross-account assignment", () => {
  const db = createCmsTestDb();
  try {
    const a = seedCmsAccountAndSite(db, { accountId: "acct-a", siteId: "site-a" });
    seedCmsAccountAndSite(db, { accountId: "acct-a", siteId: "site-a2", siteSlug: "second", siteName: "Second site", isDefault: 0 });
    const b = seedCmsAccountAndSite(db, { accountId: "acct-b", siteId: "site-b" });
    db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,route_path,title) VALUES (?,?,?,?,?,?)")
      .run("page-a", a.accountId, a.siteId, "home", "/", "A Home");
    db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,route_path,title) VALUES (?,?,?,?,?,?)")
      .run("page-a2", a.accountId, "site-a2", "home", "/", "A2 Home");
    assert.throws(() => db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,title) VALUES (?,?,?,?,?)")
      .run("bad-page", a.accountId, b.siteId, "bad", "Bad"), /FOREIGN KEY/);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_pages WHERE slug='home'").get().n, 2);
  } finally { db.close(); }
});

test("collections are site-owned and publications are immutable release records", () => {
  const db = createCmsTestDb();
  try {
    const { accountId, siteId } = seedCmsAccountAndSite(db);
    db.prepare(`INSERT INTO cms_collections (id,account_id,site_id,name,slug)
      VALUES ('collection-a',?,?, 'Summer collection','summer')`).run(accountId, siteId);
    db.prepare(`INSERT INTO cms_publications
      (id,account_id,site_id,release_number,status,manifest_object_key,manifest_hash)
      VALUES ('release-a',?,?,1,'building','sites/site-test/releases/1.json','sha256-a')`).run(accountId, siteId);
    db.prepare("UPDATE cms_publications SET status='published', published_at=datetime('now') WHERE id='release-a'").run();
    db.prepare(`INSERT INTO cms_collection_items
      (id,account_id,site_id,collection_id,item_type,item_ref,sort_order)
      VALUES ('item-product',?,?, 'collection-a','product','42',0),
             ('item-asset',?,?, 'collection-a','asset','media-7',1)`).run(accountId,siteId,accountId,siteId);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_collection_items WHERE collection_id='collection-a'").get().n, 2);
    db.prepare(`INSERT INTO cms_collections (id,account_id,site_id,name,slug,allowed_item_types_json)
      VALUES ('assets-only',?,?, 'Assets only','assets-only','["asset"]')`).run(accountId,siteId);
    assert.throws(() => db.prepare(`INSERT INTO cms_collection_items
      (id,account_id,site_id,collection_id,item_type,item_ref)
      VALUES ('disallowed-product',?,?,'assets-only','product','43')`).run(accountId,siteId), /cms_collection_item_type_not_allowed/);
    assert.throws(() => db.prepare(`INSERT INTO cms_collection_items
      (id,account_id,site_id,collection_id,item_type,item_ref)
      VALUES ('bad-item',?,'site-test','collection-a','product','99')`).run('acct-other'), /FOREIGN KEY|cms_collection_item_scope_mismatch/);
    assert.throws(() => db.prepare("UPDATE cms_publications SET status='failed' WHERE id='release-a'").run(), /cms_publication_immutable/);
    assert.throws(() => db.prepare("DELETE FROM cms_publications WHERE id='release-a'").run(), /cms_publication_immutable/);
  } finally { db.close(); }
});

test("definitions remain semantic contracts in the product migration stream", async () => {
  const sql = await read("db/migrations/002_cms_definitions.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS cms_definitions/);
  assert.match(sql, /settings_schema_json/);
  assert.match(sql, /allowed_blocks_json/);
  assert.match(sql, /artifact_id TEXT REFERENCES cms_artifacts\(id\)/);
});
