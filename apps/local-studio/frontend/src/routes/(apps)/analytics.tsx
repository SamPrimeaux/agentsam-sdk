import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/analytics")({
  component: () => <Navigate to="/admin/analytics" search={true} replace />,
});
