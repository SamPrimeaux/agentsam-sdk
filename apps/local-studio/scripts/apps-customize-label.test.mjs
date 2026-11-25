import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("Customize → Apps owns installed apps and tools; the Side Stage view is retired and old panels links redirect to Apps", () => {
  const manifest = read("../frontend/src/components/settings/localStudioSettingsManifest.ts");
  assert.match(manifest, /id: "apps", label: "Apps"/);
  assert.doesNotMatch(manifest, /id: "panels"/);
  assert.doesNotMatch(manifest, /label: "Side Stage"/);
  const router = read("../frontend/src/components/settings/LocalStudioSettingsPage.tsx");
  assert.match(router, /requestedViewProp === "panels" \? "apps"/);
  assert.match(router, /view === "apps"/);
  assert.doesNotMatch(router, /SideStagePreferencesPage/);
});

test("Tool visibility is not installation or plugin authorization", () => {
  const source = read("../frontend/src/components/settings/ToolsPreferences.tsx");
  assert.match(source, /Tools<\/h2>/);
  assert.match(source, /never uninstalls a tool/);
  assert.doesNotMatch(source, /Side Stage/);
  const apps = read("../frontend/src/components/settings/AppsManagementPage.tsx");
  assert.match(apps, /Install, open, disable, or remove the existing admin applications for this account/);
  assert.match(apps, /plugins are managed in Plugins/);
  assert.match(apps, /<ToolsPreferences \/>/);
});

test("an embedded settings pane never reads or writes the page address", () => {
  const router = read("../frontend/src/components/settings/LocalStudioSettingsPage.tsx");
  assert.match(router, /embedded = false/);
  assert.match(router, /if \(embedded \|\| typeof window === "undefined"\) return;/);
  assert.match(router, /if \(cancelled \|\| embedded\) return;/);
});
