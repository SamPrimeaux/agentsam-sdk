import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
test("Apps is the visible Customize label while old panels view deep links keep working", () => {
  const source = read("../frontend/src/components/settings/localStudioSettingsManifest.ts");
  assert.match(source, /id: "panels", label: "Apps"/);
  const router = read("../frontend/src/components/settings/LocalStudioSettingsPage.tsx");
  assert.match(router, /view === "panels"/);
});
test("Apps explains visibility differs from installation and authorization", () => {
  const source = read("../frontend/src/components/settings/SideStagePreferencesPage.tsx");
  assert.match(source, /<h2[^>]*>Apps<\/h2>/);
  assert.match(source, /not installations/);
  assert.match(source, /does not delete work, uninstall an app, or revoke a plugin connection/);
});
