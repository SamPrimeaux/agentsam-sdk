import assert from "node:assert/strict";
import test from "node:test";
import { createStorefrontShellTheme } from "../src/index.js";

test("createStorefrontShellTheme returns stable stock contract", () => {
  const theme = createStorefrontShellTheme();
  assert.equal(theme.id, "theme.storefront.shell");
  assert.equal(theme.slug, "heuristic-theme");
  assert.equal(theme.kind, "storefront-shell");
  assert.ok(theme.surfaces.includes("cms.editor"));
  assert.ok(theme.slots.shell.includes("header"));
  assert.equal(theme.tokens["--color-accent"], "#1e6a6f");
  assert.equal(theme.metadata.package, "@inneranimalmedia/heuristic-theme");
  assert.deepEqual(createStorefrontShellTheme(), theme);
});

import { createHeuristicThemeProductRow } from "../src/index.js";

test("createHeuristicThemeProductRow emits D1-ready product identity", () => {
  const row = createHeuristicThemeProductRow({ accountId: "acct_demo", repositoryId: "repo_sdk" });
  assert.equal(row.slug, "heuristic-theme");
  assert.equal(row.kind, "theme");
  assert.equal(row.status, "wired");
  assert.equal(row.metadata.capabilities[0], "theme.storefront.shell");
  assert.equal(row.canonical_path, "packages/heuristic-theme");
});
