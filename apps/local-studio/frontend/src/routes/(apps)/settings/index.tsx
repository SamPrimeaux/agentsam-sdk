import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/settings/")({
  component: () => <Navigate to="/admin/settings" search={true} replace />,
});
