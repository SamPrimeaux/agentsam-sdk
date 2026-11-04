import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { schema, stub } from "./cms-schema.mjs";

const migration = readFileSync(
  new URL("../db/migrations/005_cms_site_themes.sql", import.meta.url), "utf8",
);

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(stub + "\n" + schema);
  // Catalog/release tables live in the shared platform schema, not this CMS schema.
  db.exec("CREATE TABLE agentsam_products(id TEXT PRIMARY KEY);");
  db.exec("CREATE TABLE agentsam_product_releases(id TEXT PRIMARY KEY);");
  db.exec("INSERT INTO accounts(id) VALUES ('acct-a'), ('acct-b')");
  db.exec(`
    INSERT INTO cms_sites(id, account_id, name, slug)
    VALUES ('site-a', 'acct-a', 'One', 'one'),
           ('site-a2', 'acct-a', 'Two', 'two'),
           ('site-b', 'acct-b', 'Three', 'three');
    INSERT INTO agentsam_products(id) VALUES ('product-1');
    INSERT INTO agentsam_product_releases(id) VALUES ('release-1');
  `);
  db.exec(migration);
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

function installed(db, id, siteId = "site-a", accountId = "acct-a") {
  db.prepare(`
    INSERT INTO cms_site_themes(
      id, account_id, site_id, name, source_kind,
      source_product_id, source_release_id,
      status, storage_ref, draft_manifest_key, draft_revision
    ) VALUES (?, ?, ?, ?, 'catalog', 'product-1', 'release-1',
      'ready', 'store-theme-files', ?, 1)
  `).run(id, accountId, siteId, "My theme " + id, "sites/" + siteId + "/themes/" + id + "/draft/1.json");
}

test("migration is additive and idempotent on the existing CMS SQLite schema", () => {
  const db = createDatabase();
  try {
    db.exec(migration);
    assert.equal(db.prepare("SELECT count(*) AS n FROM cms_site_themes").get().n, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const columns = db.prepare("PRAGMA table_info(cms_site_themes)").all().map(row => row.name);
    for (const expected of ["account_id", "site_id", "source_release_id", "storage_ref",
      "draft_manifest_key", "draft_revision", "published_manifest_key", "published_revision"]) {
      assert.ok(columns.includes(expected), expected);
    }
  } finally { db.close(); }
});

test("many drafts per store and identical releases across independent sites are allowed", () => {
  const db = createDatabase();
  try {
    installed(db, "theme-a");
    installed(db, "theme-b");
    installed(db, "theme-c", "site-a2");
    installed(db, "theme-d", "site-b", "acct-b");
    assert.equal(db.prepare("SELECT count(*) AS n FROM cms_site_themes WHERE site_id='site-a'").get().n, 2);
    assert.equal(db.prepare("SELECT count(*) AS n FROM cms_site_themes").get().n, 4);
    assert.equal(db.prepare("SELECT count(DISTINCT site_id) AS n FROM cms_site_themes").get().n, 3);
  } finally { db.close(); }
});

test("only one live theme per site; publication requires a real manifest", () => {
  const db = createDatabase();
  try {
    installed(db, "theme-a");
    installed(db, "theme-b");
    installed(db, "theme-c", "site-a2");

    assert.throws(() => db.exec("UPDATE cms_site_themes SET is_live=1 WHERE id='theme-a'"), /CHECK constraint/);
    db.exec(`
      UPDATE cms_site_themes SET published_manifest_key='sites/site-a/themes/theme-a/release/1.json',
        published_revision=1, is_live=1 WHERE id='theme-a';
      UPDATE cms_site_themes SET published_manifest_key='sites/site-a/themes/theme-b/release/1.json',
        published_revision=1 WHERE id='theme-b';
    `);
    assert.throws(() => db.exec("UPDATE cms_site_themes SET is_live=1 WHERE id='theme-b'"), /UNIQUE constraint/);
    db.exec("UPDATE cms_site_themes SET published_manifest_key='sites/site-a2/themes/theme-c/release/1.json', published_revision=1, is_live=1 WHERE id='theme-c'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM cms_site_themes WHERE is_live=1").get().n, 2);

    db.exec("BEGIN");
    db.exec("UPDATE cms_site_themes SET is_live=0 WHERE id='theme-a'");
    db.exec("UPDATE cms_site_themes SET is_live=1 WHERE id='theme-b'");
    db.exec("COMMIT");
    assert.equal(db.prepare("SELECT id FROM cms_site_themes WHERE site_id='site-a' AND is_live=1").get().id, "theme-b");
    assert.throws(() => db.exec("UPDATE cms_site_themes SET status='archived' WHERE id='theme-b'"), /CHECK constraint/);
  } finally { db.close(); }
});

test("site ownership is enforced at the database boundary", () => {
  const db = createDatabase();
  try {
    assert.throws(() => installed(db, "forbidden", "site-b", "acct-a"), /FOREIGN KEY constraint/);
    assert.throws(() => installed(db, "missing", "no-site", "acct-a"), /FOREIGN KEY constraint/);
    installed(db, "theme-a");
    db.exec("DELETE FROM cms_sites WHERE id='site-a'");
    assert.equal(db.prepare("SELECT count(*) AS n FROM cms_site_themes").get().n, 0);
  } finally { db.close(); }
});

test("invalid state and unverified ready installations cannot be persisted", () => {
  const db = createDatabase();
  try {
    assert.throws(() => db.exec(`
      INSERT INTO cms_site_themes(id,account_id,site_id,name,source_kind,status)
      VALUES ('empty','acct-a','site-a','Theme','canvas','ready')
    `), /CHECK constraint/);
    assert.throws(() => db.exec(`
      INSERT INTO cms_site_themes(id,account_id,site_id,name,source_kind)
      VALUES ('bad','acct-a','site-a','Theme','unrecognized')
    `), /CHECK constraint/);
    assert.throws(() => db.exec(`
      INSERT INTO cms_site_themes(id,account_id,site_id,name,source_kind,metadata_json)
      VALUES ('metadata','acct-a','site-a','Theme','zip','[]')
    `), /CHECK constraint/);
  } finally { db.close(); }
});
