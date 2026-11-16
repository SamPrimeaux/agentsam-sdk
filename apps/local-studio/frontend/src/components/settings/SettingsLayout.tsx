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
  const activeChatId = useWorkStore((state) => state.activeChatId);
  const segments = pathname.split("/").filter(Boolean);
  const activeUnit = normalizeSettingsUnit(
    segments[0] === "admin" && segments[1] === "settings" ? segments[2] : undefined,
  );

  return (
    <SettingsShell
      manifest={localStudioSettingsManifest}
      activeUnit={activeUnit}
      onNavigate={(unit: SettingsUnitId) => {
        void navigate({ to: `/admin/settings/${unit}` as never });
      }}
      rootLabel="Studio"
      onExit={() => {
        if (activeChatId) {
          void navigate({
            to: "/admin/chats/$chatId",
            params: { chatId: activeChatId },
          } as never);
          return;
        }
        void navigate({ to: "/admin/chats" as never });
      }}
    >
      <Outlet />
    </SettingsShell>
  );
}
