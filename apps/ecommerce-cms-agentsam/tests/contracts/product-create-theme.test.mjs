import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../frontend/", import.meta.url);
const source = (relative) => readFileSync(new URL(relative, root), "utf8");

test("universal creation palette resolves from console theme", () => {
  const markup = source("static/product-create-universal.html");
  assert.doesNotMatch(markup, /#[\da-f]{3,8}\b/i);
  for (const token of ["--c-surface-2", "--c-focus", "--c-line", "--c-muted"]) {
    assert.ok(markup.includes("var(" + token + ")"), token);
  }
});

test("home creation hero uses the console theme in both light and dark modes", () => {
  const css = source("static/css/home-workspace.css");
  const region = css.split("/* Compact presentation of Product Studio's existing ps-hero composition. */")[1]
    .split("@media (prefers-reduced-motion: reduce)")[0];
  const hero = region.split("\n").filter((line) => line.includes("fnf-home-create-hero") ||
    line.includes("var(--c-") || line.includes("color-mix(")).join("\n");
  for (const token of ["--c-surface", "--c-surface-2", "--c-line", "--c-muted",
    "--c-focus", "--c-accent", "--c-accent-ink", "--c-ink"]) {
    assert.ok(hero.includes("var(" + token + ")"), "Missing theme token " + token);
  }
  // No styling regression to the retired fixed olive palette.
  assert.doesNotMatch(hero, /#(?:f0f2e9|e8ecdf|778961|77836b|94a67a|29341820)\b/i);
});

test("navigation toggle morphs in place at upper-left, with persistent DOM and aria state", () => {
  const shell = source("shell.js");
  const css = source("static/css/console.css");
  assert.match(shell, /const navMorphIcon =/);
  assert.match(shell, /button\.classList\.toggle\("is-expanded", !collapsed\)/);
  assert.doesNotMatch(shell, /button\.innerHTML = icon\(collapsed/);
  assert.match(css, /\.console-nav-ghost-toggle--persistent\s*\{[^}]*left: 0;/s);
  assert.match(css, /console-nav-morph > span:first-child/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(shell, /toggle\.setAttribute\("aria-label", open \? "Close sidebar" : "Show sidebar"\)/);
});

test("Product Create uses existing account product endpoint and Completeful catalog", () => {
  const catalog = source("src/pages/products/PlatformProductCatalog.tsx");
  const studio = source("src/pages/products/ProductStudioPage.tsx");
  assert.match(catalog, /\/api\/admin\/platform\/products/);
  assert.match(catalog, /revision: selected\.revision/);
  assert.match(studio, /PlatformProductCatalog/);
  assert.match(studio, /<StudioWorkspace/);
  assert.match(studio, /\/api\/admin\/completeful\/catalog/);
});
