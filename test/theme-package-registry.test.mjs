import assert from "node:assert/strict";
import test from "node:test";
import {
  listThemePackages,
  resolveThemePackage,
} from "../packages/theme-scenes/src/registry.js";

test("theme registry resolves donor aliases to neutral canonical ids", () => {
  const companions = resolveThemePackage("companions-of-caddo");
  assert.equal(companions?.id, "violet");
  assert.equal(companions?.packageName, "@inneranimalmedia/theme-violet");
  assert.equal(companions?.packageNameLegacy, "@inneranimalmedia/theme-companions-site");

  const fuel = resolveThemePackage("fuelnfreetime");
  assert.equal(fuel?.id, "ember");
  assert.equal(fuel?.packageName, "@inneranimalmedia/theme-ember");

  const cypress = resolveThemePackage("cypress");
  assert.equal(cypress?.path, "packages/theme-church-site");

  const scenes = resolveThemePackage("theme-scenes");
  assert.equal(scenes?.kind, "scenes");
});

test("site themes remain distinct packages (not flattened)", () => {
  const sites = listThemePackages("site-theme");
  assert.ok(sites.length >= 7);
  assert.ok(sites.every((entry) => entry.path.startsWith("packages/theme-")));
  assert.ok(sites.every((entry) => entry.packageName.startsWith("@inneranimalmedia/theme-")));
  assert.ok(sites.every((entry) => !entry.packageName.includes("-site") || entry.id === "docs"));
});
