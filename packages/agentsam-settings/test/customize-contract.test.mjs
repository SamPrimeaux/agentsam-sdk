import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Customize gives plugins and widgets dedicated real-authority surfaces", async () => {
  const source = await readFile(new URL("../src/frontend/index.tsx", import.meta.url), "utf8");
  assert.match(source, /view === "plugins"[\s\S]*PluginCustomizeView/);
  assert.match(source, /view === "widgets"[\s\S]*WidgetCustomizeView/);
  assert.match(source, /Actual plugins saved in this account.s registry/);
  assert.match(source, /discoverPlugins/);
  assert.match(source, /installPluginFromCatalog/);
  assert.match(source, /Installed · authorization required/);
  assert.match(source, /separate requirements before tools can execute/);
  assert.doesNotMatch(source, /PluginCustomizeView[\s\S]{0,500}openAdd/);
});

test("registry failures cannot masquerade as no installed plugins or disconnected Brand", async () => {
  const source = await readFile(new URL("../src/frontend/index.tsx", import.meta.url), "utf8");
  const host = await readFile(new URL("../../../apps/local-studio/frontend/src/components/settings/localStudioSettingsHost.ts", import.meta.url), "utf8");
  assert.match(source, /pluginsError\s*\|\|\s*"No plugins installed/);
  assert.match(source, /snapshot\.pluginsError\?\(/);
  assert.match(host, /snapshot\.pluginsError\s*=\s*pluginResult\.ok\s*\?/);
});
