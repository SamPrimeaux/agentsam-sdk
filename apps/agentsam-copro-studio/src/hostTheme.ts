/** The host-appearance contract the AgentSam host serves; CoPro loads it, it never copies or owns it. */
type ThemeRecord = { id: string; themeFamily?: string; cssVars?: Record<string, string> };
type Appearance = Record<string, unknown>;
type HostAppearance = {
  applyStudioShellAppearance(appearance: Appearance, root: HTMLElement): void;
  bootstrapStudioAppearanceFromCache(accountId: string, root: HTMLElement): boolean;
  projectStudioShellAppearance(record: ThemeRecord | null, fallback: { theme: string }): Appearance;
  writeStudioAppearanceCache(accountId: string, appearance: Appearance): void;
};

const HOST_APPEARANCE_MODULE = "/admin/js/shell-appearance.mjs";

/**
 * Standalone CoPro has no palette of its own. It does exactly what the AgentSam
 * host does: project the account's active `cms_themes` record onto :root
 * (--nav-*, --color-*, --copro-theme-*) through the host's own applier (served
 * at the host origin, so apps never import each other), so a theme edited in
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
  let host: HostAppearance;
  try {
    host = (await import(/* @vite-ignore */ HOST_APPEARANCE_MODULE)) as HostAppearance;
  } catch (error) {
    console.warn("[copro/host-theme] theme host unavailable, appearance not applied", error);
    return;
  }
  const systemTheme = () => (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const painted = host.bootstrapStudioAppearanceFromCache(CACHE_ACCOUNT, root);
  if (!painted) {
    host.applyStudioShellAppearance(host.projectStudioShellAppearance(null, { theme: systemTheme() }), root);
  }
  let revision = 0;
  const sync = async () => {
    const mine = ++revision;
    try {
      const record = await fetchActiveTheme();
      if (mine !== revision) return;
      const appearance = host.projectStudioShellAppearance(record, { theme: systemTheme() });
      host.applyStudioShellAppearance(appearance, root);
      host.writeStudioAppearanceCache(CACHE_ACCOUNT, appearance);
      window.dispatchEvent(new CustomEvent("agentsam:theme-applied", { detail: appearance }));
    } catch (error) {
      console.warn("[copro/host-theme] registry unavailable, keeping last appearance", error);
    }
  };
  void sync();
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void sync(); });
}

// Keep this as a host-served platform contract; never import Local Studio source from the CoPro app.
