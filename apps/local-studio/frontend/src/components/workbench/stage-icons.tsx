import { useSyncExternalStore } from "react";
import { Box, Database, FileCode, Film, Globe, Layers, LayoutGrid, PanelRight, Plug, Settings2, SquareTerminal, Target, Users } from "lucide-react";
import { AdminAppMark } from "@inneranimalmedia/agentsam-nav";
import type { LocalStudioPluginRecord, LocalStudioSideStageRecord } from "@/lib/connections/client";

const GLYPHS: Record<string, typeof Layers> = {
  target: Target, users: Users, globe: Globe, "file-code": FileCode, box: Box, layers: Layers,
  layout: Layers, film: Film, database: Database, "square-terminal": SquareTerminal,
  plug: Plug, "panel-right": PanelRight, settings: Settings2, apps: LayoutGrid,
};

/** Registry-driven tool icon: the stage's own logo when it ships one, otherwise its named glyph. */
export function StageIcon({ stage, className }: { stage: Pick<LocalStudioSideStageRecord, "icon" | "iconUrl">; className?: string }) {
  if (stage.iconUrl) return <img src={stage.iconUrl} alt="" className={className} draggable={false} />;
  const Glyph = GLYPHS[stage.icon] ?? Layers;
  return <Glyph className={className} />;
}

function subscribeTheme(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
/** True unless the active theme is light (the shell writes data-theme on the root element). */
export function useThemeIsDark(): boolean {
  return useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme !== "light", () => true);
}
export const themeIsDarkNow = () => typeof document === "undefined" || document.documentElement.dataset.theme !== "light";

/** Provider logo for a plugin: dark-surface variant when the theme is dark, never a generic substitute for a real logo. */
export function pluginLogoUrl(plugin: Pick<LocalStudioPluginRecord, "icon_url" | "icon_dark_url">, dark: boolean): string | null {
  return (dark ? plugin.icon_dark_url || plugin.icon_url : plugin.icon_url || plugin.icon_dark_url) || null;
}
export function PluginLogo({ plugin, className }: { plugin: LocalStudioPluginRecord; className?: string }) {
  const dark = useThemeIsDark();
  const src = pluginLogoUrl(plugin, dark);
  if (!src) return <Plug className={className} />;
  return <img src={src} alt={plugin.icon_alt || ""} className={[className, plugin.icon_fit === "cover" ? "object-cover" : "object-contain"].filter(Boolean).join(" ")} draggable={false} />;
}

/**
 * Icon for a tab that has taken on an item's identity.
 * `icon` is an image URL, `nav:<key>` (an app's catalog symbol) or `glyph:<name>`.
 */
export function TabItemIcon({ icon, className }: { icon: string; className?: string }) {
  if (icon.startsWith("nav:")) {
    return (
      <AdminAppMark size={14} app={{ key: "", label: "", kind: "app", href: null, installed: true, enabled: true, installable: true, setup_status: "", nav_icon: icon.slice(4) }} />
    );
  }
  if (icon.startsWith("glyph:")) {
    const Glyph = GLYPHS[icon.slice(6)] ?? Layers;
    return <Glyph className={className} />;
  }
  return <img src={icon} alt="" className={className} draggable={false} />;
}
