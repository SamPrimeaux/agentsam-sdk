import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(appRoot, "../..");
const json = async (file) => JSON.parse(await readFile(file, "utf8"));

test("root Ecommerce contract classifies admin as core and product/growth/providers as Apps", async () => {
  const manifest = await json(path.join(appRoot, "agentsam.app.json"));
  assert.equal(manifest.surfaces.admin.kind, "core-surface");
  assert.equal(manifest.surfaces.admin.contract, "frontend/admin.surface.json");
  assert.deepEqual(manifest.apps.bundled, ["product-studio", "growth", "completeful", "resend"]);
  assert.ok(!manifest.features.includes("admin.shell-nav"));
  assert.ok(!manifest.features.includes("commerce.product-studio"));
  assert.ok(!manifest.features.includes("growth.campaigns"));
  assert.ok(!manifest.features.includes("provider.completeful"));
  assert.ok(!manifest.features.includes("provider.resend"));
});

test("compatibility manifests point at their canonical owner instead of becoming a second authority", async () => {
  const expected = {
    "admin-shell-nav": "apps/ecommerce-cms-agentsam/frontend/admin.surface.json",
    "growth-campaigns": "apps/ecommerce-cms-agentsam/apps/growth/agentsam.app.json",
    "product-studio": "apps/ecommerce-cms-agentsam/apps/product-studio/agentsam.app.json",
    "provider-completeful": "apps/ecommerce-cms-agentsam/apps/completeful/agentsam.app.json",
    "provider-resend": "apps/ecommerce-cms-agentsam/apps/resend/agentsam.app.json",
    "mini-agentsam-composer": "packages/agentsam-workbench/agentsam.feature.json"
  };

  for (const [name, target] of Object.entries(expected)) {
    const feature = await json(path.join(repoRoot, "features", name, "agentsam.feature.json"));
    assert.equal(feature.compatibility?.canonical, target);
  }
});

test("canonical app manifest compatibility mirror cannot drift", async () => {
  const canonical = await json(path.join(appRoot, "agentsam.app.json"));
  const mirror = await json(path.join(appRoot, ".agentsam/app.json"));
  assert.deepEqual(mirror, canonical);
});
