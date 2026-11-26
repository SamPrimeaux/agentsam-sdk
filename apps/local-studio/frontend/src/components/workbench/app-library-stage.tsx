import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { AdminAppMark, useAdminApps, type AdminAppAction, type AdminAppsView, type AdminInstallableApp } from "@inneranimalmedia/agentsam-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { dayPartFromHour, greetingForDayPart, greetingNameFromDisplay } from "@/lib/day-part";
import { installAccountApp, loadAccountApps, openAccountApp, removeAccountApp, setAccountAppEnabled } from "@/lib/apps-account";
import { NATIVE_STAGE_ITEMS } from "./side-stage-tools";

const START_CHIPS = [
  { id: "code", label: "Code", prefix: null },
  { id: "write", label: "Write", prefix: "Help me write: " },
  { id: "create", label: "Create", prefix: "Help me create: " },
  { id: "learn", label: "Learn", prefix: "I want to learn about: " },
  { id: "life", label: "Life stuff", prefix: "Life stuff — " },
] as const;

const VIEWS: { id: AdminAppsView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "installed", label: "Installed" },
  { id: "browse", label: "Available" },
];

function useGreeting() {
  const user = useCurrentUser();
  const [hour, setHour] = useState<number | null>(null);
  // Local time is only known in the browser; render a neutral line until mounted.
  useEffect(() => { setHour(new Date().getHours()); }, []);
  if (hour === null) return "Welcome";
  return greetingForDayPart(dayPartFromHour(hour), greetingNameFromDisplay(user?.displayName));
}

function statusOf(app: AdminInstallableApp) {
  if (!app.installed) return app.installable ? "Not installed" : "Setup required";
  return app.enabled ? (app.delivery ? "Account enabled" : "Installed") : "Disabled";
}

function AppCard({ app, busy, confirming, onAction, onAskRemove, onCancelRemove }: {
  app: AdminInstallableApp;
  busy: boolean;
  confirming: boolean;
  onAction: (app: AdminInstallableApp, action: AdminAppAction) => void;
  onAskRemove: () => void;
  onCancelRemove: () => void;
}) {
  const status = statusOf(app);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3" data-app-key={app.key}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground [&_img]:size-5 [&_img]:rounded" aria-hidden="true">
          <AdminAppMark app={app} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium">{app.label}</h4>
            <span className={cn(
              "shrink-0 rounded-full border px-1.5 py-px text-[10px]",
              app.installed && app.enabled ? "border-accent/40 text-foreground" : "border-border text-muted-foreground",
            )}>{status}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{app.description || "Admin application"}</p>
        </div>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Remove from this account?</span>
          <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => onAction(app, "remove")}>Remove</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancelRemove}>Cancel</Button>
        </div>
      ) : app.installed ? (
        <div className="flex flex-wrap items-center gap-2">
          {app.enabled && app.href ? <Button type="button" size="sm" onClick={() => openAccountApp(app.href!, app)}>Open</Button> : null}
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onAction(app, app.enabled ? "disable" : "enable")}>
            {app.enabled ? "Disable" : "Enable"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onAskRemove}>Remove</Button>
        </div>
      ) : app.installable ? (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => onAction(app, "install")}>{busy ? "Installing…" : "Install"}</Button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The bare Side Stage tab: start something, open a tool, and manage the apps on
 * this account. Apps come from the same account catalog as Settings → Apps, so
 * install, enable, disable and remove behave identically everywhere.
 */
export function AppLibraryStage() {
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const greeting = useGreeting();
  const {
    visible, view, setView, query, setQuery, needle, loading, error, active,
    confirmRemove, setConfirmRemove, perform, refresh, apps, installedCount, availableCount,
  } = useAdminApps({
    loadApps: loadAccountApps,
    installApp: installAccountApp,
    removeApp: removeAccountApp,
    updateApp: setAccountAppEnabled,
    onInstalled: () => { window.dispatchEvent(new Event("agentsam:navigation-changed")); },
    initialView: "all",
  });

  const startChip = (chip: (typeof START_CHIPS)[number]) => {
    if (chip.prefix === null) { openSideTab("files", { ephemeral: false }); return; }
    const s = useWorkStore.getState();
    s.setDraft(s.activeChatId, chip.prefix);
  };

  return (
    <div className="scrollbar-thin h-full overflow-y-auto" data-testid="app-library-stage">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5">
        <header>
          <h2 className="text-lg font-semibold">{greeting}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Start something, open a tool, or manage your apps.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {START_CHIPS.map((chip) => (
              <Button key={chip.id} type="button" size="sm" variant="chip" onClick={() => startChip(chip)}>{chip.label}</Button>
            ))}
          </div>
        </header>

        <section aria-label="Tools">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tools</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
            {NATIVE_STAGE_ITEMS.filter((item) => item.kind !== "apps").map(({ kind, label, icon: Icon }) => (
              <li key={kind}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60"
                  onClick={() => openSideTab(kind, { ephemeral: false })}
                >
                  <Icon className="size-4 text-muted-foreground" />{label}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Apps">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Apps</h3>
            <Button type="button" size="sm" variant="ghost" disabled={loading || Boolean(active)} onClick={refresh}>
              <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Apps view" className="flex gap-1.5">
              {VIEWS.map(({ id, label }) => {
                const count = id === "all" ? apps.length : id === "installed" ? installedCount : availableCount;
                return (
                  <Button key={id} type="button" role="tab" aria-selected={view === id} size="sm"
                    variant={view === id ? "chipActive" : "chip"} onClick={() => setView(id)}>
                    {label} ({count})
                  </Button>
                );
              })}
            </div>
            <label className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Search apps" aria-label="Search apps"
                className="h-8 w-full rounded-md border border-border bg-transparent pl-8 pr-2 text-sm outline-none focus-visible:border-accent/60"
              />
            </label>
          </div>

          {loading && !apps.length ? (
            <p role="status" className="py-6 text-center text-sm text-muted-foreground">Loading apps…</p>
          ) : error && !apps.length ? (
            <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button type="button" size="sm" variant="outline" onClick={refresh}>Retry</Button>
            </div>
          ) : visible.length ? (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2" aria-live="polite">
              {visible.map((app) => (
                <AppCard
                  key={app.key} app={app} busy={active === app.key}
                  confirming={confirmRemove === app.key}
                  onAction={(a, action) => void perform(a, action)}
                  onAskRemove={() => setConfirmRemove(app.key)}
                  onCancelRemove={() => setConfirmRemove(null)}
                />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {needle ? `No apps match “${query.trim()}”.`
                : view === "installed" ? "No apps installed yet. Switch to All to install one."
                : "Every available app is already installed."}
            </p>
          )}
          {error && apps.length ? <p role="alert" className="mt-3 text-xs text-destructive">{error}</p> : null}
        </section>
      </div>
    </div>
  );
}
