import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { SettingsShell, type SettingsUnitId } from "@inneranimalmedia/agentsam-settings";
import {
  localStudioSettingsManifest,
  normalizeSettingsUnit,
} from "./localStudioSettingsManifest";

export function SettingsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const segment = pathname.split("/").filter(Boolean)[1];
  const activeUnit = normalizeSettingsUnit(segment);

  return (
    <SettingsShell
      manifest={localStudioSettingsManifest}
      activeUnit={activeUnit}
      onNavigate={(unit: SettingsUnitId) => {
        void navigate({ to: `/settings/${unit}` as never });
      }}
    >
      <Outlet />
    </SettingsShell>
  );
}
