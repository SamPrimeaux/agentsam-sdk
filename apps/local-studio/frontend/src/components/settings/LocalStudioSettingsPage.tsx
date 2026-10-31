import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  SettingsProductPage,
  type SettingsUnitId,
} from "@inneranimalmedia/agentsam-settings";
import { SettingsThemeGallery } from "@inneranimalmedia/agentsam-settings/frontend";
import type { SettingsTheme } from "@inneranimalmedia/agentsam-settings/contracts";
import { listStudioThemes } from "@/lib/themes/inventory";
import { localStudioSettingsManifest } from "./localStudioSettingsManifest";
import { localStudioSettingsHost } from "./localStudioSettingsHost";
import { LiveKeysSettingsPage } from "./LiveKeysSettingsPage";

export function LocalStudioSettingsPage({
  unitId,
  requestedView,
  connectedPluginKey,
}: {
  unitId: SettingsUnitId;
  requestedView?: string;
  connectedPluginKey?: string;
}) {
  useEffect(() => {
    if (unitId !== "customize" || !connectedPluginKey) return;
    let cancelled = false;
    void localStudioSettingsHost.snapshot().then((snapshot) => {
      if (cancelled) return;
      const plugin = snapshot.plugins.find(item =>
        item.pluginKey === connectedPluginKey && item.setupStatus === "connected");
      if (plugin) toast.success(`${plugin.name} connected`, {
        description: "Your authorized tools are now available in AgentSam.",
      });
      else toast.error("Plugin connection needs attention", {
        description: "The installation has not been confirmed as connected. Try again from Plugins.",
      });
    }).catch(() => {
      if (!cancelled) toast.error("Couldn't verify the plugin connection");
    }).finally(() => {
      if (cancelled) return;
      const current = new URL(window.location.href);
      current.searchParams.delete("connected");
      window.history.replaceState(window.history.state, "", current);
    });
    return () => { cancelled = true; };
  }, [unitId, connectedPluginKey]);

  if (unitId === "keys") {
    return <LiveKeysSettingsPage />;
  }

  // Keep Theme Studio independent from unrelated settings providers. A failed
  // model/plugin preference request must never blank the theme catalog.
  if (unitId === "themes") {
    return <LocalStudioThemeSettingsPage />;
  }

  return (
    <SettingsProductPage
      manifest={localStudioSettingsManifest}
      host={localStudioSettingsHost}
      unitId={unitId}
      requestedView={requestedView}
      onViewChange={(view) => {
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.set("view", view);
        window.history.replaceState(window.history.state, "", url);
      }}
    />
  );
}


function LocalStudioThemeSettingsPage() {
  const [themes, setThemes] = useState<SettingsTheme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void listStudioThemes().then((next) => {
      if (!cancelled) setThemes(next);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = async () => {
    setRefreshKey(value => value + 1);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Settings / Appearance</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Themes</h1>
            <p className="mt-1 text-sm text-muted-foreground">Browse the available theme library and customize private account-owned styles.</p>
          </div>
          <button type="button" className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Loading…" : "Refresh library"}
          </button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">Theme library: {error}</p>}
        {loading && !themes.length ? (
          <div className="rounded-xl border border-border p-8 text-sm text-muted-foreground">Loading available themes…</div>
        ) : (
          <SettingsThemeGallery themes={themes} host={localStudioSettingsHost} onChanged={async () => {
            const next = await listStudioThemes();
            setThemes(next);
          }} />
        )}
      </div>
    </div>
  );
}
