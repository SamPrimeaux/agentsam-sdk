import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/settings")({ component: LegacySettingsRoute });

function LegacySettingsRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/settings" || pathname === "/settings/") return <Navigate to="/admin/settings" replace />;
  return <Outlet />;
}
