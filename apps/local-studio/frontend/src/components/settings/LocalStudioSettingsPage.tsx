import { useEffect } from "react";
import { toast } from "sonner";
import {
  SettingsProductPage,
  type SettingsUnitId,
} from "@inneranimalmedia/agentsam-settings";
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
