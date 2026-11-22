import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/(apps)/samspeaks")({
  component: () => <Navigate to="/admin/samspeaks" replace />,
});
