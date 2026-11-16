import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/cms")({
  component: () => <Navigate to="/admin/cms" replace />,
});
