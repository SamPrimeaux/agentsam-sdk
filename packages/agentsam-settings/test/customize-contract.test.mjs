import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("Customize gives plugins and widgets dedicated real-authority surfaces", async () => {
  const source = await readFile(new URL("../src/frontend/index.tsx", import.meta.url), "utf8");
  assert.match(source, /view === "plugins"[\s\S]*PluginCustomizeView/);
  assert.match(source, /view === "widgets"[\s\S]*WidgetCustomizeView/);
  assert.match(source, /aria-label="Plugin directory"/);
  assert.match(source, /role="tablist" aria-label="Plugin directory"/);
  assert.match(source, /"public","personal"/);
  assert.match(source, /filteredInstalled/);
  assert.match(source, /discoverPlugins/);
  assert.match(source, /installPluginFromCatalog/);
  assert.match(source, /Installed · authorization required/);
  assert.match(source, /separate requirements before MCP tools can execute/);
  assert.doesNotMatch(source, /PluginCustomizeView[\s\S]{0,500}openAdd/);
});

test("registry failures cannot masquerade as no installed plugins or disconnected Brand", async () => {
  const source = await readFile(new URL("../src/frontend/index.tsx", import.meta.url), "utf8");
  const host = await readFile(new URL("../../../apps/local-studio/frontend/src/components/settings/localStudioSettingsHost.ts", import.meta.url), "utf8");
  assert.match(source, /pluginsError\s*\|\|\s*\(plugins\.length/);
  assert.match(source, /isConnected\(plugin\)/);
  assert.match(source, /row\.installationKey !== "catalog-v1" \|\| row\.toolCount > 0/);
  assert.match(source, /snapshot\.pluginsError\?\(/);
  assert.match(host, /snapshot\.pluginsError\s*=\s*pluginResult\.ok\s*\?/);
});

test("account registries open as focused pages with per-row actions, gated by host-reported access", async () => {
  const source = await readFile(new URL("../src/frontend/index.tsx", import.meta.url), "utf8");
  const registry = await readFile(new URL("../src/frontend/catalog-registry.tsx", import.meta.url), "utf8");
  const host = await readFile(new URL("../../../apps/local-studio/frontend/src/components/settings/localStudioSettingsHost.ts", import.meta.url), "utf8");
  const customize = source.slice(source.indexOf("function CustomizeView("), source.indexOf("function GeneralView("));
  assert.match(customize, /<CatalogRegistryView/);
  assert.match(customize, /snapshot\.catalogAccess\?\.\[kind\]/);
  assert.doesNotMatch(customize, /SettingsSheet/);
  assert.doesNotMatch(registry, /SettingsSheet|aria-modal|role="dialog"/);
  for (const action of ["Duplicate", "Turn off", "Turn on", "Delete"]) assert.match(registry, new RegExp(action));
  assert.match(registry, /role="menu"/);
  assert.match(registry, /granted\.create && Boolean\(host\.upsertCatalogItem\)/);
  // Host capabilities are derived from implemented operations, not a hand-kept list.
  assert.doesNotMatch(host, /const capabilities: SettingsCapabilities = \{/);
  assert.match(host, /describeHostCapabilities\(localStudioSettingsHost\)/);
  assert.match(host, /snapshot\.catalogAccess = \{/);
});
