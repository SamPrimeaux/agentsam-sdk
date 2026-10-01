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
}: {
  unitId: SettingsUnitId;
  requestedView?: string;
}) {
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
