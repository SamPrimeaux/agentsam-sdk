import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/campaigns")({
  component: () => <Navigate to="/admin/campaigns" replace />,
});
