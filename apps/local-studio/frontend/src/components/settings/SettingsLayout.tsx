import { Outlet } from "@tanstack/react-router";
import { SettingsNav } from "./SettingsNav";

export function SettingsLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background md:flex-row">
      <SettingsNav />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
