import { createFileRoute, Navigate } from "@tanstack/react-router";

// Retired legacy destination: use authorized Keys & secrets instead.
export const Route = createFileRoute("/_app/ship")({
  component: () => <Navigate to="/admin/settings/keys" replace />,
});
