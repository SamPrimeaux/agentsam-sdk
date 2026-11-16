import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/media/models")({
  component: () => <Navigate to="/admin/media/models" replace />,
});
