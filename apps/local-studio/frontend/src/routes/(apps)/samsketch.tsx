import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/samsketch")({
  component: () => <Navigate to="/admin/samsketch" search={true} replace />,
});
