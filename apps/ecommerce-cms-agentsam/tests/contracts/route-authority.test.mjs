import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ROUTE_MANIFEST,
  adminRouteForPath,
} from "../../backend/lib/route-manifest.js";
import {
  ADMIN_CLEAN_PAGES,
  adminHtmlFile,
  isAdminPublicPath,
} from "../../backend/lib/admin-routes.js";

test("canonical route manifest covers every clean admin document", () => {
  for (const page of ADMIN_CLEAN_PAGES) {
    const route = ADMIN_ROUTE_MANIFEST.find((entry) => entry.page === page);
    assert.ok(route, `missing route for ${page}`);
    assert.equal(route.handler, "admin-html");
  }
});

test("SPA route ownership resolves Product Studio without hardcoded Worker regexes", () => {
  const create = adminRouteForPath("/admin/products/create");
  const edit = adminRouteForPath("/admin/products/create/prod_123");
  const artwork = adminRouteForPath("/admin/products/help/artwork");

  assert.equal(create?.owner?.id, "product-studio");
  assert.equal(edit?.owner?.id, "product-studio");
  assert.equal(artwork?.owner?.id, "product-studio");
  assert.equal(edit?.handler, "admin-spa");
});

test("App routes resolve to the corresponding App owner", () => {
  assert.equal(adminRouteForPath("/admin/growth")?.owner?.id, "growth");
  assert.equal(adminRouteForPath("/admin/email")?.owner?.id, "resend");
});

test("core routes remain core and preserve clean document resolution", () => {
  assert.equal(adminRouteForPath("/admin/theme-editor")?.owner?.kind, "core");
  assert.equal(adminHtmlFile("/admin/theme-editor"), "/admin/theme-editor.html");
  assert.equal(adminHtmlFile("/admin/email"), "/admin/dashboard/email.html");
  assert.equal(isAdminPublicPath("/admin/login"), true);
  assert.equal(isAdminPublicPath("/admin/home"), false);
});
