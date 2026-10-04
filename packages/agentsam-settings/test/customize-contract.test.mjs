import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Customize gives plugins and widgets dedicated real-authority surfaces", async () => {
  const source = await readFile(new URL("../src/frontend/index.tsx", import.meta.url), "utf8");
  assert.match(source, /view === "plugins"[\s\S]*PluginCustomizeView/);
  assert.match(source, /view === "widgets"[\s\S]*WidgetCustomizeView/);
  assert.match(source, /Installed capabilities from the live AgentSam plugin registry/);
  assert.match(source, /Health is measured by the runtime/);
  assert.doesNotMatch(source, /PluginCustomizeView[\s\S]{0,500}openAdd/);
});
