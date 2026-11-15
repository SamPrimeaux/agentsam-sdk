import assert from "node:assert/strict";
import { test } from "node:test";
import { pluginNeedsReconnect, pluginsForMenu } from "./plugin-state.ts";

const plugin = (over: Record<string, unknown>) => ({
  id: "plg_1", plugin_key: "figma", display_name: "Figma", plugin_kind: "mcp", is_enabled: true,
  setup_status: "connected", health_status: "healthy", ...over,
}) as never;

test("reconnect is needed for unconfigured setup or auth/availability failures only", () => {
  assert.equal(pluginNeedsReconnect({ setup_status: "unconfigured", health_status: "unknown" }), true);
  for (const health of ["auth_error", "unreachable", "unhealthy"])
    assert.equal(pluginNeedsReconnect({ setup_status: "connected", health_status: health }), true);
  for (const health of ["healthy", "unknown", "degraded"])
    assert.equal(pluginNeedsReconnect({ setup_status: "connected", health_status: health }), false);
});

test("menu lists one entry per plugin, surfaces the installation needing attention, skips native tools", () => {
  const list = pluginsForMenu([
    plugin({ id: "plg_a", plugin_key: "github", display_name: "GitHub" }),
    plugin({ id: "plg_b", plugin_key: "github", display_name: "GitHub", health_status: "auth_error" }),
    plugin({ id: "plg_c", plugin_key: "cad-engine-occt", display_name: "OpenCascade", plugin_kind: "native" }),
    plugin({ id: "plg_d", plugin_key: "figma", display_name: "Figma" }),
  ]);
  assert.deepEqual(list.map((p) => [p.display_name, p.id]), [["Figma", "plg_d"], ["GitHub", "plg_b"]]);
});
