import assert from "node:assert/strict";
import { test } from "node:test";
import {
  desktopEcommerceHostDestination,
  resolveEcommerceAdminPath,
  resolveEcommerceAssetPath,
  shouldRedirectEcommerceAppHost,
} from "./ecommerce-routing.ts";

test("desktop site-owned Theme Studio routes stay inside the registered Ecommerce host", () => {
  const editor = "/admin/sites/site_123/themes/theme_ember/editor/home";
  assert.equal(resolveEcommerceAdminPath(editor), editor);
  assert.equal(
    desktopEcommerceHostDestination(editor),
    "/admin/apps/ecommerce-cms-agentsam?page=" + encodeURIComponent(editor),
  );
  assert.equal(
    resolveEcommerceAssetPath(editor),
    "/ecommerce-cms-agentsam/admin/theme-editor.html",
  );
});

test("desktop mounts packaged CMS documents; web keeps Worker-owned document navigation", () => {
  const editor = "/admin/sites/site_123/themes/theme_ember/editor/home";
  assert.equal(shouldRedirectEcommerceAppHost(true, editor), false);
  assert.equal(shouldRedirectEcommerceAppHost(false, editor), true);
  assert.equal(shouldRedirectEcommerceAppHost(false, "/admin/theme-code-editor"), false);
});

test("unregistered or hostile paths cannot be routed through the desktop CMS host", () => {
  assert.equal(desktopEcommerceHostDestination("https://evil.example/admin/sites/site_123/themes/theme_ember/editor/home"), null);
  assert.equal(desktopEcommerceHostDestination("/admin/not-a-real-route"), null);
});
