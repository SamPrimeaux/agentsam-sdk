/** The host-appearance contract the AgentSam host serves; CoPro loads it, it never copies or owns it. */
type ThemeRecord = { id: string; themeFamily?: string; cssVars?: Record<string, string> };
// The same source module used by the hosted shell is bundled with the standalone
// editor so a missing local HTTP proxy cannot leave its semantic tokens unset.
// @ts-expect-error The shared host module is authored in JavaScript.
import * as host from "../../local-studio/shared/shell-appearance.mjs";

/**
 * Standalone CoPro has no palette of its own. It does exactly what the AgentSam
 * host does: project the account's active `cms_themes` record onto :root
 * (--nav-*, --color-*, --copro-theme-*) through the shared host applier bundled at build time, so a theme edited in
 * Settings repaints this app live. When the registry is
 * unreachable the last-known-good appearance stays; with no cache the host's
 * own default palette applies (never a CoPro-local preset).
 */
const CACHE_ACCOUNT = "standalone-copro";

async function fetchActiveTheme(): Promise<ThemeRecord | null> {
  const response = await fetch("/api/studio/themes", {
    credentials: "include",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("theme_registry_" + response.status);
  const registry = await response.json();
  const activeId = registry?.activeThemeId ? String(registry.activeThemeId) : "";
  const themes: ThemeRecord[] = Array.isArray(registry?.themes) ? registry.themes : [];
  return activeId ? themes.find((theme) => String(theme.id) === activeId) ?? null : null;
}

export async function startHostTheme(root: HTMLElement = document.documentElement): Promise<void> {
  const systemTheme = () => (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const apply = (appearance: ReturnType<typeof host.projectStudioShellAppearance>) => {
    host.applyStudioShellAppearance(appearance, root);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", appearance.tokens.canvas);
  };
  // Only a selected account theme is durable. Old anonymous fallback palettes
  // must not override a new host default or the current OS appearance.
  const cached = host.readStudioAppearanceCache(CACHE_ACCOUNT);
  apply(cached?.themeId ? cached : host.projectStudioShellAppearance(null, { theme: systemTheme() }));
  let revision = 0;
  const sync = async () => {
    const mine = ++revision;
    try {
      const record = await fetchActiveTheme();
      if (mine !== revision) return;
      const appearance = host.projectStudioShellAppearance(record, { theme: systemTheme() });
      apply(appearance);
      host.writeStudioAppearanceCache(CACHE_ACCOUNT, appearance);
      window.dispatchEvent(new CustomEvent("agentsam:theme-applied", { detail: appearance }));
    } catch (error) {
      console.warn("[copro/host-theme] registry unavailable, keeping last appearance", error);
    }
  };
  void sync();
  window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", () => {
    const latest = host.readStudioAppearanceCache(CACHE_ACCOUNT);
    if (!latest?.themeId) apply(host.projectStudioShellAppearance(null, { theme: systemTheme() }));
    void sync();
  });
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void sync(); });
}
