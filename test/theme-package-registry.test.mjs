import assert from "node:assert/strict";
import test from "node:test";
import {
  listThemePackages,
  resolveThemePackage,
} from "../packages/theme-scenes/src/registry.js";

test("theme registry resolves aliases without renaming packages", () => {
  const companions = resolveThemePackage("companions-of-caddo");
  assert.equal(companions?.packageName, "@inneranimalmedia/theme-companions-site");
  assert.equal(companions?.id, "companions-site");

  const fuel = resolveThemePackage("fuelnfreetime");
  assert.equal(fuel?.packageName, "@inneranimalmedia/theme-fuelnfree-site");

  const scenes = resolveThemePackage("theme-scenes");
  assert.equal(scenes?.kind, "scenes");
});

test("site themes remain distinct packages (not flattened)", () => {
  const sites = listThemePackages("site-theme");
  assert.ok(sites.length >= 7);
  assert.ok(sites.every((entry) => entry.path.startsWith("packages/theme-")));
});
