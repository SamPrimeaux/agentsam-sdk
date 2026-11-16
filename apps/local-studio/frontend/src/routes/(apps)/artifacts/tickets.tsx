import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/artifacts/tickets")({ component: LegacyArtifactTicketsRoute });

function LegacyArtifactTicketsRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/artifacts/tickets" || pathname === "/artifacts/tickets/") return <Navigate to="/admin/artifacts/tickets" replace />;
  return <Outlet />;
}
