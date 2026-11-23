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

test("ecommerce module/provider registry only references canonical package manifests", async () => {
  const registry = await json(path.join(appRoot, "apps/registry.json"));
  const roles = { "product-studio": "module", growth: "module", completeful: "provider", resend: "provider" };
  assert.deepEqual(registry.apps.map(row => row.id), Object.keys(roles));
  for (const entry of registry.apps) {
    assert.equal(entry.kind, roles[entry.id]);
    const file = path.join(appRoot, entry.contract);
    const manifest = await json(file);
    assert.equal(manifest.schema, "agentsam.package.v1");
    assert.equal(manifest.kind, entry.kind);
    assert.equal(manifest.owner_app_id, "ecommerce-cms-agentsam");
    assert.equal(manifest.installable, false);
  }
});

test("canonical app manifest compatibility mirror cannot drift", async () => {
  const canonical = await json(path.join(appRoot, "agentsam.app.json"));
  const mirror = await json(path.join(appRoot, ".agentsam/app.json"));
  assert.equal(canonical.schema, 'agentsam.app.v1');
  assert.equal(mirror.schema, 'agentsam.host-install.v1');
  assert.equal(mirror.app_id, canonical.id);
  assert.equal(mirror.id, undefined, 'host state must never redefine APP identity');
});
