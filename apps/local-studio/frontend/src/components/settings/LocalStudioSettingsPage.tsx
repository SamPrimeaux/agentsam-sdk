import { useMemo } from "react";
import {
  SettingsProductPage,
  createFixtureSettingsHost,
  getSettingsFixture,
  type SettingsFixtureName,
  type SettingsUnitId,
} from "@inneranimalmedia/agentsam-settings";
import { localStudioSettingsManifest } from "./localStudioSettingsManifest";
import { LiveKeysSettingsPage } from "./LiveKeysSettingsPage";

function fixtureFromLocation(): SettingsFixtureName {
  if (typeof window === "undefined") return "populated";
  const value = new URLSearchParams(window.location.search).get("fixture");
  if (value === "first-run" || value === "degraded" || value === "security-findings") {
    return value;
  }
  return "populated";
}

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

  const fixture = fixtureFromLocation();
  const host = useMemo(
    () => createFixtureSettingsHost(getSettingsFixture(fixture)),
    [fixture],
  );

  return (
    <SettingsProductPage
      manifest={localStudioSettingsManifest}
      host={host}
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
