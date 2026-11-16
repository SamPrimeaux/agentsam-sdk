import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/settings/integrations")({
  component: () => <Navigate to="/admin/settings/integrations" search={true} replace />,
});
