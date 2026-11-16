import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/store")({
  component: () => <Navigate to="/admin/themes" replace />,
});
