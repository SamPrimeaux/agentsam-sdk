import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(appRoot, relative), "utf8"));

test("admin frontend is a core surface, not an installable App/feature", async () => {
  const surface = await readJson("frontend/admin.surface.json");
  assert.equal(surface.kind, "core-surface");
  assert.equal(surface.owner, "ecommerce-cms-agentsam");
  assert.equal(surface.route_authority, "backend/lib/route-manifest.js");
});

test("bundled Apps resolve to self-contained contracts and implementation paths", async () => {
  const registry = await readJson("apps/registry.json");
  assert.deepEqual(registry.apps.map((app) => app.id), [
    "product-studio",
    "growth",
    "completeful",
    "resend",
  ]);

  for (const entry of registry.apps) {
    const contract = await readJson(entry.contract);
    assert.equal(contract.id, entry.id);
    assert.match(contract.role, /-app$/);
    for (const values of Object.values(contract.implementation || {})) {
      for (const relative of Array.isArray(values) ? values : [values]) {
        await access(path.join(appRoot, relative));
      }
    }
  }
});
