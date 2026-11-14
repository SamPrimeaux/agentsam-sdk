import { lazy, Suspense, useState } from "react";
import { AdminAppMark } from "@inneranimalmedia/agentsam-nav";
import { Pin, PinOff, Settings2 } from "lucide-react";
import type { SettingsUnitId } from "@inneranimalmedia/agentsam-settings";
import type { SideItem, SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { Button } from "@/components/ui/button";
import { useWorkStore } from "@/lib/work/store";
import { pinAccountApp, reloadAccountApps, useAccountApps } from "@/lib/apps-account";
import { pluginNeedsReconnect } from "@/lib/connections/plugin-state";
import { useAccountPlugins } from "@/lib/connections/account-plugins";
import { settingsPaneLabel } from "@/components/settings/settingsPaneLabel";
import { useActiveCompanion } from "../../../agentsam/CompanionContext";
import { resolveCompanion } from "../../../agentsam/companions";
import { PluginLogo } from "./stage-icons";

const LocalStudioSettingsPage = lazy(() =>
  import("@/components/settings/LocalStudioSettingsPage").then((m) => ({ default: m.LocalStudioSettingsPage })));

/** Settings panes open inside the same tab; the page address never changes. */
function useTabSettings(tab: SideTab) {
  const convertSideTab = useWorkStore((s) => s.convertSideTab);
  return (unit: string, view?: string) => convertSideTab(tab.id, "item", {
    title: settingsPaneLabel(unit, view),
    icon: "glyph:settings",
    item: { type: "settings", unit, ...(view ? { view } : {}) },
    ephemeral: false,
  });
}

const Status = ({ children }: { children: string }) => <p role="status" className="p-6 text-sm text-muted-foreground">{children}</p>;

/** The user's chosen companion, falling back to Geaux (the platform mascot) if none is chosen or its art can't load. */
function CompanionMascot() {
  const active = useActiveCompanion();
  const [fallback, setFallback] = useState(false);
  const [hidden, setHidden] = useState(false);
  const companion = fallback ? resolveCompanion("geaux") : active;
  const src = companion.portraitUrl ?? companion.avatarUrl ?? resolveCompanion("geaux").portraitUrl;
  if (!src || hidden) return null;
  return (
    <img
      src={src} alt="" draggable={false}
      // Sized from the container, never a fixed pixel size: grows with the stage, stays within sane bounds.
      style={{ width: "clamp(6rem, 34cqmin, 22rem)", height: "auto" }}
      onError={() => { if (fallback) setHidden(true); else setFallback(true); }}
    />
  );
}

function ConnectionIssue({ name, onReconnect, onRetry }: { name: string; onReconnect: () => void; onRetry: () => void }) {
  return (
    <div className="h-full w-full" style={{ containerType: "size" }}>
      <div className="grid h-full place-items-center px-6">
        <div className="flex flex-col items-center text-center" style={{ gap: "clamp(0.75rem, 3cqmin, 1.5rem)" }}>
          <CompanionMascot />
          <h2 className="font-semibold" style={{ fontSize: "clamp(1.125rem, 4.4cqmin, 2rem)" }}>Couldn’t connect to {name}</h2>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={onReconnect}>Reconnect</Button>
            <Button type="button" variant="outline" onClick={onRetry}>Retry</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemHeader({ icon, title, meta, children }: { icon: React.ReactNode; title: string; meta?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted [&_img]:size-5 [&_img]:rounded-sm">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-medium">{title}</h2>
        {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      {children}
    </div>
  );
}

function AppItem({ tab, appKey }: { tab: SideTab; appKey: string }) {
  const { apps, loaded, error, reload } = useAccountApps();
  const openSettings = useTabSettings(tab);
  const [busy, setBusy] = useState(false);
  const app = apps.find((candidate) => candidate.key === appKey);
  if (!loaded) return <Status>Loading…</Status>;
  if (!app) {
    return (
      <ConnectionIssue name={tab.title} onReconnect={() => openSettings("customize", "apps")} onRetry={() => void reload()} />
    );
  }
  const status = !app.installed ? "Not installed" : app.enabled ? "Installed" : "Turned off";
  const togglePin = async () => {
    setBusy(true);
    try { await pinAccountApp(app.key, !app.pinned); await reloadAccountApps(); } finally { setBusy(false); }
  };
  const live = app.installed && app.enabled;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ItemHeader icon={<AdminAppMark app={app} size={18} />} title={app.label} meta={status}>
        {app.installed ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void togglePin()}>
            {app.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}{app.pinned ? "Unpin" : "Pin"}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={() => openSettings("customize", "apps")}><Settings2 className="size-3.5" />Manage</Button>
      </ItemHeader>
      {live && app.embed_href ? (
        <iframe
          key={app.embed_href} src={app.embed_href} title={app.label}
          allow="clipboard-read; clipboard-write; fullscreen"
          className="min-h-0 w-full flex-1 border-0 bg-background"
        />
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-8">
          <p className="text-sm text-muted-foreground">{app.description || "Admin application"}</p>
          {error ? <p role="alert" className="text-xs text-destructive">Couldn’t refresh this app. Showing the last known state.</p> : null}
          {!app.installed ? (
            <div className="flex items-center gap-3">
              <p className="text-sm">Install {app.label} from your Apps to use it here.</p>
              <Button type="button" size="sm" onClick={() => openSettings("customize", "apps")}>Open Apps</Button>
            </div>
          ) : !app.enabled ? (
            <div className="flex items-center gap-3">
              <p className="text-sm">{app.label} is turned off.</p>
              <Button type="button" size="sm" onClick={() => openSettings("customize", "apps")}>Turn on</Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PluginItem({ tab, pluginId, pluginKey }: { tab: SideTab; pluginId: string; pluginKey: string }) {
  const { plugins, loaded, error, reload } = useAccountPlugins();
  const openSettings = useTabSettings(tab);
  const plugin = plugins.find((candidate) => candidate.id === pluginId) ?? plugins.find((candidate) => candidate.plugin_key === pluginKey);
  if (!loaded) return <Status>Loading…</Status>;
  const toSettings = () => openSettings("customize", "plugins");
  if (error || !plugin || pluginNeedsReconnect(plugin)) {
    return <ConnectionIssue name={plugin?.display_name || tab.title} onReconnect={toSettings} onRetry={() => void reload()} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ItemHeader icon={<PluginLogo plugin={plugin} className="size-5 rounded-sm" />} title={plugin.display_name}
        meta={plugin.is_enabled ? "Connected" : "Turned off"}>
        <Button type="button" size="sm" variant="outline" onClick={toSettings}><Settings2 className="size-3.5" />Manage</Button>
      </ItemHeader>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-6 py-8">
        <p className="text-sm text-muted-foreground">{plugin.description || `${plugin.display_name} is connected to your account.`}</p>
        {plugin.tool_count ? <p className="text-xs text-muted-foreground">{plugin.tool_count} {plugin.tool_count === 1 ? "tool" : "tools"} available to AgentSam</p> : null}
      </div>
    </div>
  );
}

/** A tab that has become an app, a plugin, or a settings pane. */
export function ItemStage({ tab }: { tab: SideTab }) {
  const item: SideItem | null | undefined = tab.item;
  if (!item) return <Status>Nothing to show here.</Status>;
  if (item.type === "app") return <AppItem tab={tab} appKey={item.key} />;
  if (item.type === "plugin") return <PluginItem tab={tab} pluginId={item.pluginId} pluginKey={item.pluginKey} />;
  return (
    <Suspense fallback={<Status>Loading…</Status>}>
      <LocalStudioSettingsPage unitId={item.unit as SettingsUnitId} requestedView={item.view} embedded />
    </Suspense>
  );
}
