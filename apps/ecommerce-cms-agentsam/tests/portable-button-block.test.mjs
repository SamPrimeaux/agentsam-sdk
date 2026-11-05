import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../packages/theme-contract/runtime/portable-sections.js", import.meta.url), "utf8");
const scope = {};
vm.runInNewContext(source, { globalThis: scope });
const portable = scope.ThemePortableSections;

test("portable hero exposes a real editable Button block contract", () => {
  const schema = portable.schema("revise/sticky-curtain");
  assert.equal(schema.blocks.length, 1);
  assert.equal(schema.blocks[0].key, "button");
  assert.equal(schema.blocks[0].definitionKey, "button");
  assert.equal(schema.blocks[0].category, "Basic");
  assert.deepEqual(JSON.parse(JSON.stringify(schema.blocks[0].fields.map((field) => field.key))), ["label", "href", "variant"]);
});

test("new hero defaults include a persisted button block and render it through the storefront renderer", () => {
  const content = portable.defaults("revise/sticky-curtain");
  assert.deepEqual(JSON.parse(JSON.stringify(content.__editor.blocks)), [{ id: "button1", templateKey: "button", enabled: true }]);
  assert.deepEqual(JSON.parse(JSON.stringify(content.button1)), { label: "Explore", href: "/shop", variant: "solid" });
  assert.equal(portable.validate("revise/sticky-curtain", content).ok, true);

  const markup = portable.render({ key: "catalog-preview", content });
  assert.match(markup, /data-cms-block="button1"/);
  assert.match(markup, /data-cms="button1\.label">Explore</);
  assert.match(markup, /data-cms="button1\.href"/);
  assert.match(markup, /class="ps-cta ps-cta--solid"/);
});

test("portable hero button block rejects unsafe destinations", () => {
  const content = portable.defaults("revise/sticky-curtain");
  content.button1.href = "javascript:alert(1)";
  assert.equal(portable.validate("revise/sticky-curtain", content).ok, false);
});

test("existing hero content without a block keeps its legacy CTA renderer", () => {
  const content = portable.defaults("revise/sticky-curtain");
  delete content.button1;
  content.__editor.blocks = [];
  content.ctaPrimary = { label: "Shop now", href: "/shop" };
  const markup = portable.render({ key: "legacy-hero", content });
  assert.match(markup, /data-cms="ctaPrimary\.label">Shop now</);
  assert.doesNotMatch(markup, /data-cms-block="button1"/);
});

test("shared portable runtime contains no customer-specific FNF presets", () => {
  assert.equal(portable.catalog().some((item) => item.id.startsWith("fnf/")), false);
  assert.doesNotMatch(source, /fnf\//);
});
