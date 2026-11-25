import test from "node:test";
import assert from "node:assert/strict";
import { resolveConsoleFile, shouldServeProductCatalogView } from "./packaged-console.js";
import { isLocalStudioEcommerceDocumentPath, resolveLocalStudioEcommerceAdminRoute } from "../../shared/ecommerce-admin-routes.mjs";
import { canonicalStudioPath, isStudioAdminPath, isStudioShellAdminPath } from "../../shared/studio-admin-routes.mjs";

test("the canonical store route is Studio-owned, not packaged HTML", () => {
  assert.equal(resolveConsoleFile("/admin/store"), null);
});

test("the legacy /sites URL no longer serves a second store page", () => {
  assert.equal(resolveConsoleFile("/sites"), null);
});

test("MovieMode project and editor routes both render inside the shared admin shell", () => {
  for (const path of ["/admin/moviemode", "/admin/moviemode/edit"]) {
    assert.equal(isStudioAdminPath(path), true, path + " belongs to the canonical admin namespace");
    assert.equal(isStudioShellAdminPath(path), true, path + " renders inside the shared AgentSam shell");
  }
});

test("installed theme projects use the existing CMS project editor route", () => {
  assert.equal(resolveConsoleFile("/admin/theme-project-editor"), "theme-project-editor.html");
  assert.equal(resolveConsoleFile("/admin/theme-editor"), "theme-editor.html");
  assert.equal(resolveConsoleFile("/admin/sites/site_a/themes/theme_a/editor/home"), "theme-editor.html");
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


test('Local Studio is the sole canonical route authority for installed Ecommerce pages', () => {
  for (const [path, asset] of [
    ['/admin/pages', 'pages.html'],
    ['/admin/sites/site_a/pages/page_a/editor', 'theme-editor.html'],
    ['/admin/theme-project-editor', 'theme-project-editor.html'],
    ['/admin/products', 'products.html'],
    ['/admin/orders', 'orders.html'],
    ['/admin/inventory', 'inventory.html'],
    ['/admin/preferences', 'preferences.html'],
  ]) {
    const route = resolveLocalStudioEcommerceAdminRoute(path);
    assert.equal(route?.authority, 'local-studio', path + ' has Local Studio route authority');
    assert.equal(resolveConsoleFile(path), asset, path + ' serves its packaged capability');
    assert.equal(isStudioAdminPath(path), true, path + ' belongs to the canonical admin namespace');
  }
  assert.equal(isLocalStudioEcommerceDocumentPath('/admin/theme-editor'), true);
  assert.equal(isLocalStudioEcommerceDocumentPath('/admin/store'), false);
  assert.equal(resolveConsoleFile('/admin/store'), null, 'the Store host route must not recursively serve itself');
  assert.equal(resolveLocalStudioEcommerceAdminRoute('/admin/not-a-real-cms-page'), null);
});
