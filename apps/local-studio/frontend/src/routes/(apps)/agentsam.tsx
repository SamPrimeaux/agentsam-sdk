import { createFileRoute, Navigate, Outlet, useRouterState } from "@tanstack/react-router";

/** Keep the legacy child app routes intact; redirect only the exact old chat URL. */
export const Route = createFileRoute("/(apps)/agentsam")({ component: LegacyAgentSamRoute });

function LegacyAgentSamRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === "/agentsam") return <Navigate to="/admin/agentsam" replace />;
  return <Outlet />;
}
