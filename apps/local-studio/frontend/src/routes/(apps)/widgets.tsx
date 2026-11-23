import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/widgets")({
  component: () => <Navigate to="/admin/agentsam" search={true} replace />,
});
