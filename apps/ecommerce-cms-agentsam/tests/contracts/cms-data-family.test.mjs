import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(appRoot, "../..");

const read = (name) => readFile(path.join(repoRoot, "db", name), "utf8");

test("CMS data-family migration creates the five normalized tables without replacing legacy authority", async () => {
  const sql = await read("migrate-cms-data-family-20261007.sql");

  for (const table of [
    "cms_pages",
    "cms_page_sections",
    "cms_section_blocks",
    "cms_revisions",
    "cms_globals",
  ]) {
    assert.match(sql, new RegExp("CREATE TABLE IF NOT EXISTS " + table));
  }

  assert.match(sql, /legacy_page_id/);
  assert.match(sql, /legacy_section_id/);
  assert.match(sql, /FROM pages p/);
  assert.match(sql, /FROM page_sections s/);
  assert.doesNotMatch(sql, /DROP TABLE\s+(?:pages|page_sections)/i);
  assert.doesNotMatch(sql, /ALTER TABLE\s+(?:pages|page_sections)/i);
});

test("site pseudo-page is projected to globals while the original page remains intact", async () => {
  const sql = await read("migrate-cms-data-family-20261007.sql");
  assert.match(sql, /WHERE p\.slug = 'site'/);
  assert.match(sql, /INSERT INTO cms_globals/);
  assert.match(sql, /legacy_page_slug/);
});

test("block backfill is factual and conservative", async () => {
  const sql = await read("seed-cms-section-blocks-20261007.sql");
  const inserts = sql.match(/INSERT INTO cms_section_blocks/g) || [];

  assert.equal(inserts.length, 16);
  assert.match(sql, /cmsb_legacy_8_card1/);
  assert.match(sql, /cmsb_legacy_10_f4/);
  assert.match(sql, /cmsb_legacy_9_v3/);
  assert.doesNotMatch(sql, /ctaPrimary/);
  assert.doesNotMatch(sql, /ctaSecondary/);
});

test("imported hero instances preserve unique key while normalizing reusable section type", async () => {
  const sql = await read("seed-cms-section-blocks-20261007.sql");
  assert.match(sql, /legacy_section_id=28/);
  assert.match(sql, /legacy_section_id=29/);
  assert.match(sql, /section_type='hero'/);
});
