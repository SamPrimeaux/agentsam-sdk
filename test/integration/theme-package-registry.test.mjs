import assert from "node:assert/strict";
import test from "node:test";
import {
  listThemePackages,
  resolveThemePackage,
} from "../../packages/theme-scenes/src/registry.js";

test("theme registry resolves canonical package identities only", () => {
  const violet = resolveThemePackage("violet");
  assert.equal(violet?.id, "violet");
  assert.equal(violet?.packageName, "@inneranimalmedia/theme-violet");
  assert.equal(violet?.packageNameLegacy, undefined);

  const ember = resolveThemePackage("theme-ember");
  assert.equal(ember?.id, "ember");
  assert.equal(ember?.packageName, "@inneranimalmedia/theme-ember");

  const cypress = resolveThemePackage("cypress");
  assert.equal(cypress?.path, "packages/theme-cypress");

  const scenes = resolveThemePackage("theme-scenes");
  assert.equal(scenes?.kind, "scenes");
});

test("site themes remain distinct canonical packages", () => {
  const sites = listThemePackages("site-theme");
  assert.ok(sites.length >= 7);
  assert.ok(sites.every((entry) => entry.path.startsWith("packages/theme-")));
  assert.ok(sites.every((entry) => entry.packageName.startsWith("@inneranimalmedia/theme-")));
  assert.ok(sites.every((entry) => !("packageNameLegacy" in entry)));
});
