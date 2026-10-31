import assert from "node:assert/strict";
import test from "node:test";
import { createCmsTestDb, seedCmsAccountAndSite } from "../cms-test-db.mjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relative) => readFile(path.join(appRoot, relative), "utf8");

test("canonical artifacts use provider-neutral object keys and stay separate from block settings", () => {
  const db = createCmsTestDb();
  try {
    const { accountId, siteId } = seedCmsAccountAndSite(db);
    db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,route_path,title) VALUES ('page-a',?,?, 'home','/','Home')")
      .run(accountId, siteId);
    db.prepare(`INSERT INTO cms_page_sections (id,account_id,page_id,section_key,section_type)
      VALUES ('section-a',?,'page-a','hero','hero')`).run(accountId);
    db.prepare(`INSERT INTO cms_artifacts
      (id,account_id,artifact_key,artifact_type,version,object_prefix,manifest_object_key,content_hash)
      VALUES ('artifact-a',?,'block/hero','embed','1','sites/site-test/artifacts/hero/','sites/site-test/artifacts/hero/manifest.json','sha256-a')`).run(accountId);
    db.prepare(`INSERT INTO cms_section_blocks
      (id,account_id,section_id,block_key,block_type,artifact_id,content_json)
      VALUES ('block-a',?,'section-a','hero-code','custom','artifact-a','{"label":"Hero"}')`).run(accountId);
    const artifact = db.prepare("SELECT object_prefix,manifest_object_key FROM cms_artifacts WHERE id='artifact-a'").get();
    assert.equal(artifact.object_prefix, "sites/site-test/artifacts/hero/");
    assert.equal(artifact.manifest_object_key, "sites/site-test/artifacts/hero/manifest.json");
    assert.equal(db.prepare("SELECT content_json FROM cms_section_blocks WHERE id='block-a'").get().content_json, '{"label":"Hero"}');
  } finally { db.close(); }
});

test("nested block ownership rejects cross-section parents, cycles and cross-account artifacts", () => {
  const db = createCmsTestDb();
  try {
    const a = seedCmsAccountAndSite(db, { accountId: "acct-a", siteId: "site-a" });
    const b = seedCmsAccountAndSite(db, { accountId: "acct-b", siteId: "site-b" });
    db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,title) VALUES ('page-a',?,?, 'a','A')").run(a.accountId, a.siteId);
    db.prepare("INSERT INTO cms_pages (id,account_id,site_id,slug,title) VALUES ('page-b',?,?, 'b','B')").run(b.accountId, b.siteId);
    db.prepare("INSERT INTO cms_page_sections (id,account_id,page_id,section_key,section_type) VALUES ('section-a',?,'page-a','a','hero')").run(a.accountId);
    db.prepare("INSERT INTO cms_page_sections (id,account_id,page_id,section_key,section_type) VALUES ('section-b',?,'page-b','b','hero')").run(b.accountId);
    db.prepare("INSERT INTO cms_section_blocks (id,account_id,section_id,block_key,block_type) VALUES ('parent-a',?,'section-a','parent','group')").run(a.accountId);
    db.prepare("INSERT INTO cms_section_blocks (id,account_id,section_id,parent_block_id,block_key,block_type) VALUES ('child-a',?,'section-a','parent-a','child','text')").run(a.accountId);
    assert.throws(() => db.prepare("UPDATE cms_section_blocks SET parent_block_id='child-a' WHERE id='parent-a'").run(), /cms_block_parent_cycle/);
    assert.throws(() => db.prepare("INSERT INTO cms_section_blocks (id,account_id,section_id,parent_block_id,block_key,block_type) VALUES ('cross','acct-a','section-b','parent-a','cross','text')").run(), /FOREIGN KEY|cms_block_parent_scope_mismatch/);
    db.prepare(`INSERT INTO cms_artifacts (id,account_id,artifact_key,artifact_type,version,object_prefix,manifest_object_key,content_hash)
      VALUES ('artifact-b',?,'b','embed','1','b/','b/manifest.json','hash')`).run(b.accountId);
    assert.throws(() => db.prepare("INSERT INTO cms_section_blocks (id,account_id,section_id,block_key,block_type,artifact_id) VALUES ('bad-artifact','acct-a','section-a','bad','custom','artifact-b')").run(), /cms_block_artifact_scope_mismatch/);
  } finally { db.close(); }
});

test("block registry supports real content, nested, commerce and utility primitives", async () => {
  const registry = JSON.parse(await read("cms/block-types.json"));
  for (const key of [
    "heading", "text", "image", "button", "group",
    "product-title", "product-price", "product-rating", "product-sku",
    "product-swatches", "copyright", "policy-links", "social-links",
  ]) assert.ok(registry.types[key], "missing block type: " + key);
  assert.equal(registry.types.group.container, true);
  assert.equal(registry.types.image.authority, "media_assets");
  assert.equal(registry.types.custom, undefined);
  assert.deepEqual(registry.editorActions["generate-with-agentsam"].capabilities, ["code.generate", "code.edit"]);
  assert.equal(registry.editorActions["generate-with-agentsam"].persists_as, "definition.type");
});
