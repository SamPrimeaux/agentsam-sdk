import { createFileRoute, Navigate } from "@tanstack/react-router";

// Retired legacy destination: use authorized Keys & secrets instead.
export const Route = createFileRoute("/(apps)/admin/ship")({
  component: () => <Navigate to="/admin/settings/keys" replace />,
});
