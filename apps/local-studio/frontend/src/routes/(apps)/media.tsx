import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/media")({ component: LegacyMediaRoute });

function LegacyMediaRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/media" || pathname === "/media/") return <Navigate to="/admin/media" replace />;
  return <Outlet />;
}
