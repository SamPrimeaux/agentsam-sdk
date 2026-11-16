import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/cli")({
  component: () => <Navigate to="/admin/cli" replace />,
});
