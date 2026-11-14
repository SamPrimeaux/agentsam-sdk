import { useEffect, useMemo, useState } from "react";
import { AdminAppMark, type AdminInstallableApp } from "@inneranimalmedia/agentsam-nav";
import { ChevronDown, Globe, LayoutGrid, Pin, PinOff, Plug, X } from "lucide-react";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StudioMark } from "@/components/mark";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { dayPartFromHour, greetingForDayPart, greetingNameFromDisplay } from "@/lib/day-part";
import { markAccountAppOpened, reloadAccountApps, useAccountApps } from "@/lib/apps-account";
import { loadBrowserHistory, removeBrowserHistoryEntry, type BrowserHistoryEntry } from "@/lib/browser-history";
import { orderTools, useToolUsage } from "@/lib/new-tab-tools";
import { pluginNeedsReconnect, pluginsForMenu } from "@/lib/connections/plugin-state";
import { useAccountPlugins } from "@/lib/connections/account-plugins";
import type { LocalStudioPluginRecord } from "@/lib/connections/client";
import { reloadSideStageRegistry, useSideStageRegistry, type SideStageAction } from "../../../agentsam/side-stage-actions";
import { settingsPaneLabel } from "@/components/settings/settingsPaneLabel";
import { PluginLogo, StageIcon, pluginLogoUrl, themeIsDarkNow } from "./stage-icons";

const START_CHIPS = [
  { id: "code", label: "Code", prefix: null },
  { id: "write", label: "Write", prefix: "Help me write: " },
  { id: "create", label: "Create", prefix: "Help me create: " },
  { id: "learn", label: "Learn", prefix: "I want to learn about: " },
  { id: "life", label: "Life stuff", prefix: "Life stuff — " },
] as const;

/** Settings panes reachable from the New tab; labels come from the Settings manifest. */
const CUSTOMIZE_PANES: { unit: string; view?: string }[] = [
  { unit: "customize", view: "plugins" },
  { unit: "customize", view: "apps" },
  { unit: "customize", view: "companions" },
  { unit: "network" },
  { unit: "runtime" },
];

function useGreeting() {
  const user = useCurrentUser();
  const [hour, setHour] = useState<number | null>(null);
  // Local time exists only in the browser; render a neutral line until mounted.
  useEffect(() => { setHour(new Date().getHours()); }, []);
  if (hour === null) return "Welcome";
  return greetingForDayPart(dayPartFromHour(hour), greetingNameFromDisplay(user?.displayName));
}

function appForUrl(url: string, apps: AdminInstallableApp[]): AdminInstallableApp | null {
  try {
    const target = new URL(url);
    if (target.origin !== window.location.origin) return null;
    return apps.find((app) => [app.embed_href, app.href].some((href) => href && target.pathname.startsWith(href.replace(/\/$/, "")))) ?? null;
  } catch { return null; }
}

function SuggestedIcon({ entry, apps }: { entry: BrowserHistoryEntry; apps: AdminInstallableApp[] }) {
  const [broken, setBroken] = useState(false);
  const app = appForUrl(entry.url, apps);
  if (app) return <AdminAppMark app={app} size={22} />;
  let sameOrigin = false;
  try { sameOrigin = new URL(entry.url).origin === window.location.origin; } catch { /* not a URL */ }
  if (sameOrigin) return <StudioMark className="size-6" />;
  if (broken) return <Globe className="size-5 text-muted-foreground" />;
  return <img src={entry.icon_url} alt="" className="size-6 rounded-sm object-contain" onError={() => setBroken(true)} draggable={false} />;
}

/**
 * The New tab: one place to start something, open a tool, find an app or plugin, and
 * pick up where you left off. Opening anything turns THIS tab into that item, so the
 * page address never changes. Installing and removing apps lives in Settings → Apps.
 */
export function NewTabStage({ tab }: { tab?: SideTab }) {
  const greeting = useGreeting();
  const user = useCurrentUser();
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const convertSideTab = useWorkStore((s) => s.convertSideTab);
  const registry = useSideStageRegistry();
  const { usage, togglePin, markOpened } = useToolUsage(user?.id);
  const { apps, loaded: appsLoaded, error: appsError, reload: reloadApps } = useAccountApps();
  const { plugins, loaded: pluginsLoaded, error: pluginsError, reload: reloadPlugins } = useAccountPlugins();
  const [history, setHistory] = useState<BrowserHistoryEntry[] | null>(null);

  useEffect(() => { void loadBrowserHistory(8).then(setHistory); }, []);

  const tools = useMemo(
    () => orderTools(registry.actions.filter((stage) => stage.renderer === "builtin" && stage.enabled !== false), usage),
    [registry.actions, usage],
  );

  const become = (kind: Parameters<typeof openSideTab>[0], extra: Partial<SideTab>) => {
    const next = { ephemeral: false, ...extra };
    if (tab) convertSideTab(tab.id, kind, next); else openSideTab(kind, next);
  };
  const openTool = (stage: SideStageAction) => {
    markOpened(stage.id);
    become(stage.tabKind as Parameters<typeof openSideTab>[0], {
      title: stage.label,
      ...(stage.tabKind === "plugin" ? { pluginId: stage.pluginId, stageId: stage.stageId } : {}),
    });
  };
  const openApp = (app: AdminInstallableApp) => {
    become("item", {
      title: app.label,
      icon: app.icon_url || (app.nav_icon ? `nav:${app.nav_icon}` : "glyph:apps"),
      item: { type: "app", key: app.key },
    });
    if (app.installed && app.enabled) void markAccountAppOpened(app.key).then(() => reloadAccountApps());
  };
  const openPlugin = (plugin: LocalStudioPluginRecord) => become("item", {
    title: plugin.display_name,
    icon: pluginLogoUrl(plugin, themeIsDarkNow()) || "glyph:plug",
    item: { type: "plugin", pluginId: plugin.id, pluginKey: plugin.plugin_key },
  });
  const openSettings = (unit: string, view?: string) => become("item", {
    title: settingsPaneLabel(unit, view),
    icon: "glyph:settings",
    item: { type: "settings", unit, ...(view ? { view } : {}) },
  });
  const openPage = (entry: BrowserHistoryEntry) => become("browser", {
    title: entry.title, url: entry.url, history: [entry.url], historyIndex: 0,
  });
  const startChip = (chip: (typeof START_CHIPS)[number]) => {
    if (chip.prefix === null) { openSideTab("files", { ephemeral: false }); return; }
    const s = useWorkStore.getState();
    s.setDraft(s.activeChatId, chip.prefix);
  };
  const forgetPage = (entry: BrowserHistoryEntry) => {
    setHistory((current) => current?.filter((item) => item.url !== entry.url) ?? current);
    void removeBrowserHistoryEntry(entry.url);
  };

  const installed = apps.filter((app) => app.installed);
  const pinnedApps = installed.filter((app) => app.pinned);
  const recentApps = installed.filter((app) => !app.pinned && app.last_opened_at != null)
    .sort((a, b) => (b.last_opened_at ?? 0) - (a.last_opened_at ?? 0)).slice(0, 4);
  const shownIds = new Set([...pinnedApps, ...recentApps].map((app) => app.key));
  const otherInstalled = installed.filter((app) => !shownIds.has(app.key));
  const available = apps.filter((app) => !app.installed);
  const menuPlugins = pluginsForMenu(plugins);

  const appItem = (app: AdminInstallableApp) => (
    <DropdownMenuItem key={app.key} onSelect={() => openApp(app)}>
      <span className="grid size-5 shrink-0 place-items-center [&_img]:size-4 [&_img]:rounded-sm"><AdminAppMark app={app} size={16} /></span>
      <span className="min-w-0 flex-1 truncate">{app.label}</span>
      {app.installed && !app.enabled ? <span className="text-[10px] text-muted-foreground">Off</span> : null}
      {app.pinned ? <Pin className="size-3 text-muted-foreground" /> : null}
    </DropdownMenuItem>
  );
  const groupLabel = (text: string) => <div className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/80">{text}</div>;

  return (
    <div className="scrollbar-thin h-full overflow-y-auto" data-testid="new-tab-stage">
      <div className="mx-auto flex max-w-3xl flex-col gap-7 px-4 py-6">
        <header>
          <h2 className="text-lg font-semibold">{greeting}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Start something, open a tool, or pick up where you left off.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {START_CHIPS.map((chip) => (
              <Button key={chip.id} type="button" size="sm" variant="chip" onClick={() => startChip(chip)}>{chip.label}</Button>
            ))}
          </div>
        </header>

        <section aria-label="Tools">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tools</h3>
          {!registry.loaded ? (
            <p role="status" className="py-3 text-sm text-muted-foreground">Loading tools…</p>
          ) : registry.error ? (
            <div role="alert" className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
              Couldn’t load your tools.
              <Button type="button" size="sm" variant="outline" onClick={() => void reloadSideStageRegistry()}>Retry</Button>
            </div>
          ) : tools.length ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {tools.map((stage) => {
                const pinned = usage.pinned.includes(stage.id);
                return (
                  <li key={stage.id} className="group relative">
                    <button type="button" onClick={() => openTool(stage)}
                      className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 pr-8 text-left text-sm transition-colors hover:bg-muted/60">
                      <StageIcon stage={stage} className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{stage.label}</span>
                    </button>
                    <button type="button" aria-label={pinned ? `Unpin ${stage.label}` : `Pin ${stage.label}`}
                      onClick={() => togglePin(stage.id)}
                      className={cn("absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-opacity hover:text-foreground focus-visible:opacity-100",
                        pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                      {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
              No tools are turned on.
              <Button type="button" size="sm" variant="outline" onClick={() => openSettings("customize", "apps")}>Choose tools</Button>
            </div>
          )}

          <div className="mt-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button"
                  className="flex h-10 w-full max-w-sm items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-sm text-foreground transition-colors hover:bg-muted/70">
                  <LayoutGrid className="size-4 text-muted-foreground" />More tools…<ChevronDown className="ml-auto size-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[min(28rem,70vh)] w-[min(22rem,90vw)] overflow-y-auto">
                <DropdownMenuLabel>Apps</DropdownMenuLabel>
                {!appsLoaded ? <div role="status" className="px-3 py-2 text-xs text-muted-foreground">Loading apps…</div>
                  : appsError && !apps.length ? <DropdownMenuItem onSelect={() => void reloadApps()}>Couldn’t load apps · Retry</DropdownMenuItem>
                  : <>
                      {pinnedApps.length ? <>{groupLabel("Pinned")}{pinnedApps.map(appItem)}</> : null}
                      {recentApps.length ? <>{groupLabel("Recent")}{recentApps.map(appItem)}</> : null}
                      {otherInstalled.length ? <>{groupLabel("Your apps")}{otherInstalled.map(appItem)}</> : null}
                      {available.length ? <>{groupLabel("Platform apps")}{available.map(appItem)}</> : null}
                    </>}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Plugins and MCPs</DropdownMenuLabel>
                {!pluginsLoaded ? <div role="status" className="px-3 py-2 text-xs text-muted-foreground">Loading plugins…</div>
                  : pluginsError ? <DropdownMenuItem onSelect={() => void reloadPlugins()}>Couldn’t load plugins · Retry</DropdownMenuItem>
                  : menuPlugins.length ? menuPlugins.map((plugin) => (
                    <DropdownMenuItem key={plugin.id} onSelect={() => openPlugin(plugin)}>
                      <span className="grid size-5 shrink-0 place-items-center"><PluginLogo plugin={plugin} className="size-4 rounded-sm" /></span>
                      <span className="min-w-0 flex-1 truncate">{plugin.display_name}</span>
                      {pluginNeedsReconnect(plugin) ? <span className="text-[10px] text-muted-foreground">Reconnect</span> : null}
                    </DropdownMenuItem>
                  )) : (
                    <DropdownMenuItem onSelect={() => openSettings("customize", "plugins")}><Plug className="size-4" />Add plugins</DropdownMenuItem>
                  )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Customize</DropdownMenuLabel>
                {CUSTOMIZE_PANES.map((pane) => (
                  <DropdownMenuItem key={`${pane.unit}:${pane.view ?? ""}`} onSelect={() => openSettings(pane.unit, pane.view)}>
                    {settingsPaneLabel(pane.unit, pane.view)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        <section aria-label="Suggested">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested</h3>
          {history === null ? (
            <p role="status" className="py-2 text-sm text-muted-foreground">Loading…</p>
          ) : history.length ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
              {history.map((entry) => (
                <li key={entry.url} className="group relative">
                  <button type="button" onClick={() => openPage(entry)} title={entry.url}
                    className="flex w-full flex-col items-center gap-2 rounded-xl px-2 py-3 text-center transition-colors hover:bg-muted/60">
                    <span className="grid size-11 place-items-center rounded-xl border border-border bg-card"><SuggestedIcon entry={entry} apps={apps} /></span>
                    <span className="line-clamp-2 w-full text-xs">{entry.title}</span>
                  </button>
                  <button type="button" aria-label={`Remove ${entry.title} from suggestions`} onClick={() => forgetPage(entry)}
                    className="absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100">
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Pages you open in Browser show up here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
