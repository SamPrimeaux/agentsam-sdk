import "@inneranimalmedia/agentsam-settings/frontend/styles.css";
import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import "@inneranimalmedia/agentsam-workbench/widgets/widgets.css";
import { toast } from "sonner";
import { SettingsProductPage, type SettingsUnitId } from "@inneranimalmedia/agentsam-settings";
import { localStudioSettingsManifest } from "./localStudioSettingsManifest";
import { localStudioSettingsHost } from "./localStudioSettingsHost";
import { LiveKeysSettingsPage } from "./LiveKeysSettingsPage";
import { InnerAnimalCompanionsPage } from "../../../agentsam/InnerAnimalCompanionsPage";
import { AppsManagementPage } from "./AppsManagementPage";
import { BrowserSettings } from "./BrowserSettings";
import { McpManagementPage } from "./McpManagementPage";
import { RuntimeManagerPage } from "@/components/runtime/RuntimeManagerPage";
import { PlatformNavigationSettings } from "./PlatformNavigationSettings";

export function LocalStudioSettingsPage({
  unitId,
  requestedView: requestedViewProp,
  connectedPluginKey,
  embedded = false,
}: {
  unitId: SettingsUnitId;
  requestedView?: string;
  connectedPluginKey?: string;
  /** Embedded surfaces do not read or write the browser address. */
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const requestedView = unitId === "customize" && requestedViewProp === "panels" ? "apps" : requestedViewProp;

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
      if (cancelled || embedded) return;
      void navigate({
        to: pathname as never,
        search: (previous: Record<string, unknown>) => ({ ...previous, connected: undefined }) as never,
        replace: true,
      } as never);
    });
    return () => { cancelled = true; };
  }, [unitId, connectedPluginKey, embedded, navigate, pathname]);

  return (
    <SettingsProductPage
      manifest={localStudioSettingsManifest}
      host={localStudioSettingsHost}
      unitId={unitId}
      requestedView={requestedView}
      onViewChange={(view) => {
        if (embedded || typeof window === "undefined") return;
        void navigate({
          to: pathname as never,
          search: (previous: Record<string, unknown>) => ({ ...previous, view }) as never,
          replace: true,
        } as never);
      }}
      renderCustomView={(unit, view) => {
        if (unit === "keys") return <LiveKeysSettingsPage view={view} embedded />;
        if (unit === "runtime") return <RuntimeManagerPage embedded />;
        if (unit === "themes" && view === "navigation") return <PlatformNavigationSettings />;
        if (unit === "customize" && view === "apps") return <AppsManagementPage />;
        if (unit === "customize" && view === "mcps") return <McpManagementPage />;
        if (unit === "customize" && view === "companions") return <InnerAnimalCompanionsPage />;
        if (unit === "network" && view === "browser") return <BrowserSettings />;
        return null;
      }}
    />
  );
}
