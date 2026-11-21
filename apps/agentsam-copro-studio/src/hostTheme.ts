// @ts-ignore Shared portable host-appearance contract (cms_themes projection).
import { applyStudioShellAppearance, bootstrapStudioAppearanceFromCache, projectStudioShellAppearance, writeStudioAppearanceCache } from "../../local-studio/shared/shell-appearance.mjs";

/**
 * Standalone CoPro has no palette of its own. It does exactly what the AgentSam
 * host does: project the account's active `cms_themes` record onto :root
 * (--nav-*, --color-*, --copro-theme-*) through the one shared applier, so a
 * theme edited in Settings repaints this app live. When the registry is
 * unreachable the last-known-good appearance stays; with no cache the host's
 * own default palette applies (never a CoPro-local preset).
 */
const CACHE_ACCOUNT = "standalone-copro";

type ThemeRecord = { id: string; themeFamily?: string; cssVars?: Record<string, string> };

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

export function startHostTheme(root: HTMLElement = document.documentElement): void {
  const systemTheme = () => (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const painted = bootstrapStudioAppearanceFromCache(CACHE_ACCOUNT, root);
  if (!painted) {
    applyStudioShellAppearance(projectStudioShellAppearance(null, { theme: systemTheme() }), root);
  }
  let revision = 0;
  const sync = async () => {
    const mine = ++revision;
    try {
      const record = await fetchActiveTheme();
      if (mine !== revision) return;
      const appearance = projectStudioShellAppearance(record, { theme: systemTheme() });
      applyStudioShellAppearance(appearance, root);
      writeStudioAppearanceCache(CACHE_ACCOUNT, appearance);
      window.dispatchEvent(new CustomEvent("agentsam:theme-applied", { detail: appearance }));
    } catch (error) {
      console.warn("[copro/host-theme] registry unavailable, keeping last appearance", error);
    }
  };
  void sync();
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void sync(); });
}
