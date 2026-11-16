import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/artifacts")({ component: LegacyArtifactsRoute });

function LegacyArtifactsRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/artifacts" || pathname === "/artifacts/") return <Navigate to="/admin/artifacts" replace />;
  return <Outlet />;
}
