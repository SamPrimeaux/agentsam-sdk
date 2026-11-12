import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("installed Apps and Side Stage have distinct Customize views; old panels links remain valid", () => {
  const source = read("../frontend/src/components/settings/localStudioSettingsManifest.ts");
  assert.match(source, /id: "apps", label: "Apps"/);
  assert.match(source, /id: "panels", label: "Side Stage"/);
  const router = read("../frontend/src/components/settings/LocalStudioSettingsPage.tsx");
  assert.match(router, /view === "panels"/);
  assert.match(router, /view === "apps"/);
});

test("Side Stage visibility is not installation or plugin authorization", () => {
  const source = read("../frontend/src/components/settings/SideStagePreferencesPage.tsx");
  assert.match(source, /Side Stage shortcuts/);
  assert.match(source, /hiding a Side Stage shortcut never uninstalls/);
  assert.match(source, /Use the Apps tab to install or remove an application/);
  assert.match(source, /Use Plugins to manage external connections/);
});
