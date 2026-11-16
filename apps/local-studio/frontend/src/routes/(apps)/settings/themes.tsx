import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/settings/themes")({
  component: () => <Navigate to="/admin/settings/themes" replace />,
});
