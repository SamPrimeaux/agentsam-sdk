import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "../packages/theme-contract/runtime/portable-sections.js";

const portable = globalThis.ThemePortableSections;
const ids = [
  "primetech/hero",
  "primetech/design",
  "primetech/engineering",
  "primetech/principles",
  "primetech/world",
  "primetech/cad",
  "primetech/agentsam",
  "primetech/creative",
  "primetech/themes",
  "primetech/company",
  "primetech/contact",
];

function render(id) {
  const content = portable.defaults(id);
  const validation = portable.validate(id, content);
  assert.equal(validation.ok, true, `${id} default content must satisfy its editor schema`);
  return { content, html: portable.render({ key: `test-${id.split("/")[1]}`, content }) };
}

test("PrimeTech ships eleven independent portable section definitions", () => {
  const catalog = portable.catalog().filter((item) => item.source === "primetech");
  assert.deepEqual(catalog.map((item) => item.id), ids);
  for (const item of catalog) {
    assert.equal(item.templateKey, "portable");
    assert.equal(item.preset, item.id);
  }
});

test("every PrimeTech section renders independently without a site or theme package dependency", () => {
  for (const id of ids) {
    const { html } = render(id);
    assert.match(html, /class="ps-section ps-primetech"/);
    assert.match(html, new RegExp(`data-portable-preset="${id.replaceAll("/", "\\/")}"`));
    assert.match(html, /data-primetech-scene-index="\d+"/);
    assert.match(html, /src="\/assets\/js\/primetech-scene\.js"/);
    assert.doesNotMatch(html, /(?:cms_sites|cms_pages|site_id|page_id|site-specific-theme-package)/i);
    const schema = portable.schema(id);
    assert.equal(schema.capabilities.edit, true);
    assert.equal(schema.capabilities.reorder, true);
    assert.equal(schema.capabilities.duplicate, true);
    assert.equal(schema.capabilities.remove, true);
  }
});

test("the original eleven scene stops remain addressable and the shared world is one page runtime", async () => {
  const source = await readFile(new URL("../packages/theme-contract/runtime/primetech-scene-browser.js", import.meta.url), "utf8");
  const spots = source.match(/const spots=\[([\s\S]*?)\];/)?.[1];
  assert.ok(spots, "original scene camera stops must remain in the browser runtime");
  assert.equal((spots.match(/\{p:/g) || []).length, 11);
  assert.match(source, /function cameraAt\(t\)/);
  assert.match(source, /function construction\(\)/);
  assert.match(source, /window\.__primeTechSceneMounted/);
  assert.match(source, /data-primetech-scene-index/);
  assert.match(source, /\/assets\/primetech\/companions\/\$\{character\.id\}\.png/);
});

test("the engineering section retains the original native circuit scene and self-hosted mesh runtime", async () => {
  const { html } = render("primetech/engineering");
  assert.match(html, /data-primetech-circuit/);
  assert.match(html, /src="\/assets\/js\/primetech-circuit\.js"/);
  assert.match(html, /I\.AM SCENE \/ SOURCE 4341/);
  const circuit = await readFile(new URL("../packages/theme-contract/runtime/primetech-circuit-browser.js", import.meta.url), "utf8");
  assert.match(circuit, /original-4341\.iamscene\.json/);
  assert.match(circuit, /createSceneRuntime/);
  assert.match(circuit, /sampleAnimationTrack/);
});

test("repeatable section content stays editable and validates at its declared limits", () => {
  const principles = render("primetech/principles").content;
  const world = render("primetech/world").content;
  const creative = render("primetech/creative").content;
  const themes = render("primetech/themes").content;
  assert.equal(principles.__editor.blocks.length, 6);
  assert.equal(world.__editor.blocks.length, 6);
  assert.equal(creative.__editor.blocks.length, 2);
  assert.equal(themes.__editor.blocks.length, 31);
  assert.equal(portable.validate("primetech/themes", themes).ok, true);
  const tooMany = structuredClone(themes);
  tooMany.__editor.blocks = [...tooMany.__editor.blocks, ...tooMany.__editor.blocks.slice(0, 10)];
  assert.equal(portable.validate("primetech/themes", tooMany).ok, false);
});

test("Plain Jane Journal route inventory remains 6 core, 5 category and 20 article routes", () => {
  const { content, html } = render("primetech/themes");
  const counts = Object.groupBy(content.__editor.blocks.map((block) => content[block.id].group), (group) => group);
  assert.equal(counts.core.length, 6);
  assert.equal(counts.categories.length, 5);
  assert.equal(counts.articles.length, 20);
  assert.match(html, /6 routes/);
  assert.match(html, /5 routes/);
  assert.match(html, /20 routes/);
  assert.match(html, /Route index is generated from the IAPJ package&#39;s own CMS source manifest/);
});

test("the portable renderer is styled through scoped theme tokens and keeps the original companion assets", async () => {
  const css = await readFile(new URL("../packages/theme-contract/runtime/portable-sections.css", import.meta.url), "utf8");
  assert.match(css, /\.ps-section\.ps-primetech/);
  assert.match(css, /--theme-text/);
  assert.match(css, /--theme-accent/);
  const creative = render("primetech/creative").html;
  assert.match(creative, /\/assets\/primetech\/companions\/geaux\.png/);
  assert.match(creative, /\/assets\/primetech\/companions\/meaux\.png/);
});

test("the portable contact section links to a real inquiry route without fabricating a form", () => {
  const { html } = render("primetech/contact");
  assert.match(html, /https:\/\/inneranimalmedia\.com\/contact/);
  assert.match(html, /Start a project/);
  assert.doesNotMatch(html, /<form|data-primetech-copy-brief|Prototype form/);
});
