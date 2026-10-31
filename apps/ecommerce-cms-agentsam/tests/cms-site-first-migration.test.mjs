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
    assert.deepEqual(await migrateCmsSiteFirst(adapter), { skipped: true, reason: "site_id_already_present" });
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
