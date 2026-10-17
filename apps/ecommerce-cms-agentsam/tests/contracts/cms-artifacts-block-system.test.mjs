import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(appRoot, "../..");
const read = (relative) => readFile(path.join(repoRoot, relative), "utf8");

test("canonical CMS schema keeps code/artifacts out of block content cells", async () => {
  const sql = await read("db/schema/cms.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS cms_artifacts/);
  assert.match(sql, /parent_block_id TEXT/);
  assert.match(sql, /artifact_id\s+TEXT REFERENCES cms_artifacts\(id\)/);
  assert.match(sql, /Generated code\/bundles are cms_artifacts/);
  assert.doesNotMatch(sql, /workers[_ -]?ai/i);
});

test("canonical cms_artifacts matches live caller-supplied ID behavior", async () => {
  const sql = await read("db/schema/cms.sql");
  const artifactStart = sql.indexOf("CREATE TABLE IF NOT EXISTS cms_artifacts");
  const artifactEnd = sql.indexOf("CREATE TABLE IF NOT EXISTS cms_section_blocks");
  const artifactSql = sql.slice(artifactStart, artifactEnd);
  assert.match(artifactSql, /id TEXT PRIMARY KEY,/);
  assert.doesNotMatch(artifactSql, /cmsa_.*randomblob/);
});

test("block tree integrity is tenant and section scoped", async () => {
  const sql = await read("db/migrate-cms-block-integrity-20261007.sql");
  assert.match(sql, /cms_block_parent_scope_mismatch/);
  assert.match(sql, /cms_block_parent_cycle/);
  assert.match(sql, /cms_block_artifact_scope_mismatch/);
});

test("block registry supports basic, nested, commerce and utility primitives", async () => {
  const registry = JSON.parse(
    await read("apps/ecommerce-cms-agentsam/cms/block-types.json"),
  );
  for (const key of [
    "heading",
    "text",
    "image",
    "button",
    "group",
    "product-title",
    "product-price",
    "product-rating",
    "product-sku",
    "product-swatches",
    "copyright",
    "policy-links",
    "social-links",
  ]) {
    assert.ok(registry.types[key], "missing block type: " + key);
  }
  assert.equal(registry.types.group.container, true);
  assert.equal(registry.types.image.authority, "media_assets");
  assert.equal(registry.types.custom, undefined);
  assert.deepEqual(
    registry.editorActions["generate-with-agentsam"].capabilities,
    ["code.generate", "code.edit"],
  );
  assert.equal(
    registry.editorActions["generate-with-agentsam"].persists_as,
    "definition.type",
  );
});

test("legacy factual blocks keep source paths but use meaningful normalized types", async () => {
  const sql = await read("db/seed-cms-section-blocks-20261007.sql");
  assert.doesNotMatch(sql, /,'f',\d+,'active'/);
  assert.doesNotMatch(sql, /,'v',\d+,'active'/);
  assert.doesNotMatch(sql, /,'card',\d+,'active'/);
  assert.match(sql, /,'feature',10,'active'/);
  assert.match(sql, /,'value',10,'active'/);
  assert.match(sql, /,'collection-card',10,'active'/);
  assert.match(sql, /\$\.content\.f1/);
  assert.match(sql, /\$\.content\.card1/);
  assert.match(sql, /\$\.content\.v1/);
});
