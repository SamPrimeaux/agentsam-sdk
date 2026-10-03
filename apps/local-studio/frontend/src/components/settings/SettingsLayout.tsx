import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { SettingsShell, type SettingsUnitId } from "@inneranimalmedia/agentsam-settings";
import { useWorkStore } from "@/lib/work/store";
import {
  localStudioSettingsManifest,
  normalizeSettingsUnit,
} from "./localStudioSettingsManifest";

export function SettingsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const activeTrailId = useWorkStore((state) => state.activeTrailId);
  const segment = pathname.split("/").filter(Boolean)[1];
  const activeUnit = normalizeSettingsUnit(segment);

  return (
    <SettingsShell
      manifest={localStudioSettingsManifest}
      activeUnit={activeUnit}
      onNavigate={(unit: SettingsUnitId) => {
        void navigate({ to: `/settings/${unit}` as never });
      }}
      rootLabel="Studio"
      onExit={() => {
        if (activeTrailId) {
          void navigate({
            to: "/trails/$trailId",
            params: { trailId: activeTrailId },
          } as never);
          return;
        }
        void navigate({ to: "/trails" as never });
      }}
    >
      <Outlet />
    </SettingsShell>
  );
}
