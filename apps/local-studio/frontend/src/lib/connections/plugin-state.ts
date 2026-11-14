import type { LocalStudioPluginRecord } from "./client.ts";

/** Health states that mean the account must reconnect before the plugin can be used. */
const RECONNECT_HEALTH = new Set(["auth_error", "unreachable", "unhealthy"]);

export function pluginNeedsReconnect(plugin: Pick<LocalStudioPluginRecord, "setup_status" | "health_status">): boolean {
  return plugin.setup_status === "unconfigured" || RECONNECT_HEALTH.has(plugin.health_status);
}

/**
 * One menu entry per installed plugin. An account can hold several installations of
 * the same plugin (e.g. many GitHub connections); the one needing attention is shown
 * so a reconnect is never hidden behind a healthy sibling. Native tools are not plugins here.
 */
export function pluginsForMenu(plugins: LocalStudioPluginRecord[]): LocalStudioPluginRecord[] {
  const byKey = new Map<string, LocalStudioPluginRecord>();
  for (const plugin of plugins) {
    if (plugin.plugin_kind === "native") continue;
    const current = byKey.get(plugin.plugin_key);
    const better = !current
      || (!pluginNeedsReconnect(current) && pluginNeedsReconnect(plugin))
      || (pluginNeedsReconnect(current) === pluginNeedsReconnect(plugin) && !current.is_enabled && plugin.is_enabled);
    if (better) byKey.set(plugin.plugin_key, plugin);
  }
  return [...byKey.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
}
