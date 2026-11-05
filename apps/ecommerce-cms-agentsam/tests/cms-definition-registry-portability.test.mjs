import assert from "node:assert/strict";
import test from "node:test";
import { listCmsDefinitions, normalizeCmsDefinition, attachCmsDefinitions } from "../backend/cms/definition-registry.mjs";

test("CMS definition discovery depends only on cms_definitions, never artifact registries", async () => {
  let sqlSeen = "";
  const row = {
    id: "def-marquee", definition_key: "marquee", kind: "section",
    label: "Marquee", description: "Scrolling text", category: "Content",
    origin: "generated", version: "1", status: "active",
    settings_schema_json: JSON.stringify({ text: { type: "text", label: "Marquee text", default: "After dark" } }),
    allowed_blocks_json: "[]", max_blocks: 0, metadata_json: "{}",
  };
  const env = { DB: { prepare(sql) {
    sqlSeen = sql;
    return { bind() { return this; }, async all() { return { results: [row] }; } };
  } } };
  const definitions = await listCmsDefinitions(env, "account-a", { status: "active" });
  assert.doesNotMatch(sqlSeen, /agentsam_artifacts|cms_artifacts|artifact_id/i);
  assert.equal(definitions.length, 1);
  assert.equal(Object.hasOwn(definitions[0], "artifact"), false);

  const normalized = normalizeCmsDefinition(row);
  const registry = attachCmsDefinitions({ pages: { home: { sections: {} } } }, [normalized]);
  assert.equal(registry.pages.home.sections.marquee.definitionId, "def-marquee");
  assert.equal(registry.pages.home.sections.marquee.fields[0].key, "text");
});
