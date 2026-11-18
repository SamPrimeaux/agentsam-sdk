import assert from "node:assert/strict";
import test from "node:test";
import { listCmsDefinitions, normalizeCmsDefinition, attachCmsDefinitions, normalizeCmsCatalogTemplate, listCmsComponentCatalog } from "../backend/cms/definition-registry.mjs";

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

test("catalog installation uses verified cms_components, not spoofable template metadata", async () => {
  const base = {
    id:"template-1",sku:"stock/button",template_name:"Button",label:"Button",
    status:"active",item_type:"block",template_type:"button",
    category:"Actions",template_data:JSON.stringify({
      rendererKey:"fake:button",implementationStatus:"implemented",implementationClass:"native"
    }),definition_metadata_json:JSON.stringify({
      rendererKey:"fake:button",implementationStatus:"implemented",implementationClass:"native"
    }),
    resolved_definition_id:"def-button",resolved_definition_kind:"block",
    resolved_definition_version:"1",definition_key:"button",definition_version:"1",
    definition_status:"active",definition_label:"Button"
  };
  assert.equal(normalizeCmsCatalogTemplate(base).installable,false);
  assert.equal(normalizeCmsCatalogTemplate({...base,
    resolved_renderer_key:"theme:button",resolved_implementation_status:"unverified"
  }).installable,false);
  const verified=normalizeCmsCatalogTemplate({...base,
    resolved_renderer_key:"theme:button",resolved_implementation_status:"verified"
  });
  assert.equal(verified.installable,true);
  assert.equal(verified.rendererKey,"theme:button");
  assert.equal(verified.rendererVerified,true);
  let sql="";
  const env={DB:{prepare(query){sql=query;return {bind(){return this;},async all(){return {results:[base]};}};}}};
  await listCmsComponentCatalog(env,"account-a");
  assert.match(sql,/c\.renderer_key AS resolved_renderer_key/);
  assert.match(sql,/c\.implementation_status AS resolved_implementation_status/);
});
