import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createFormStudioComponent, assertFormStudioAdapter,
  normalizeStudioResource, filterStudioResources } from "../frontend/form-studio/index.mjs";
const root = new URL("../", import.meta.url);
const registry = JSON.parse(fs.readFileSync(new URL("apps/registry.json", root)));
const manifest = JSON.parse(fs.readFileSync(new URL("apps/form-studio/agentsam.app.json", root)));
const presets = JSON.parse(fs.readFileSync(new URL("apps/form-studio/presets.json", root)));

test("Form Studio is a bundled ecommerce CMS app with one canonical preset catalog", () => {
  assert.ok(registry.apps.some(a => a.id === "form-studio" && a.bundled));
  assert.equal(manifest.id, "form-studio");
  assert.equal(manifest.role, "content-app");
  assert.ok(presets.presets.some(x => x.kind === "checkout"));
  assert.ok(presets.presets.some(x => x.kind === "modal"));
  const keys = presets.presets.map(p => p.key);
  assert.equal(new Set(keys).size, keys.length);
});
test("input validation fails closed on malformed adapters and resources", () => {
  assert.throws(() => assertFormStudioAdapter({}), /form_studio_adapter_missing_listResources/);
  assert.throws(() => normalizeStudioResource({ kind: "checkout" }), /identity/);
  const adapter = { capabilities: {}, listResources(){}, getResource(){}, createFromPreset(){}, saveResource(){}, publishResource(){} };
  assert.equal(assertFormStudioAdapter(adapter), adapter);
});
test("filter handles published / active aliases and title queries without mutating resources", () => {
  const resources = [
    normalizeStudioResource({ id: "1", kind: "form", title: "Contact", status: "active" }),
    normalizeStudioResource({ id: "2", kind: "checkout", title: "Event checkout", status: "published" }),
    normalizeStudioResource({ id: "3", kind: "modal", title: "Foster popup", status: "draft" }),
  ];
  assert.equal(filterStudioResources(resources, { status: "published" }).length, 2);
  assert.deepEqual(filterStudioResources(resources, { kind: "modal", search: "foster" }).map(r => r.id), ["3"]);
  assert.equal(resources.length, 3);
});
test("Studio exports a component factory with no tenant or payments dependency", () => {
  const fakeReact = { createElement() {}, useState() {}, useEffect() {} };
  assert.equal(typeof createFormStudioComponent(fakeReact), "function");
  assert.throws(() => createFormStudioComponent(null), /react_required/);
  const source = fs.readFileSync(new URL("frontend/form-studio/index.mjs", root), "utf8");
  assert.doesNotMatch(source, /companionscpas|companionsofcaddo|freedom_ride|stripe_secret|D1_DATABASE/i);
});
