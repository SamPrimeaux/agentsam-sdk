import test from "node:test";
import assert from "node:assert/strict";
import { resolveConsoleFile, shouldServeProductCatalogView } from "./packaged-console.js";

test("the canonical ecommerce store is served at /admin/store", () => {
  assert.equal(resolveConsoleFile("/admin/store"), "store.html");
});

test("the legacy /sites URL no longer serves a second store page", () => {
  assert.equal(resolveConsoleFile("/sites"), null);
});

test("installed theme projects use the existing CMS project editor route", () => {
  assert.equal(resolveConsoleFile("/admin/theme-project-editor"), "theme-project-editor.html");
  assert.equal(resolveConsoleFile("/admin/theme-editor"), "theme-editor.html");
});


test('canonical Products opens the existing Ecommerce catalog; Product Studio remains a separate route', () => {
  assert.equal(resolveConsoleFile('/admin/products'), 'products.html');
  assert.equal(shouldServeProductCatalogView(new URL('https://agentsam.example/admin/products?view=store')), true);
  assert.equal(shouldServeProductCatalogView(new URL('https://agentsam.example/admin/products?view=collections')), true);
  assert.equal(shouldServeProductCatalogView(new URL('https://agentsam.example/admin/products?view=platform')), true);
  assert.equal(shouldServeProductCatalogView(new URL('https://agentsam.example/admin/products')), true);
  assert.equal(resolveConsoleFile('/admin/products/create'), '_spa/index.html');
  assert.equal(shouldServeProductCatalogView(new URL('https://agentsam.example/admin/products?view=unknown')), false);
});
