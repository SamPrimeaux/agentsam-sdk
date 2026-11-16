import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/collaborate")({
  component: () => <Navigate to="/admin/collaborate" search={true} replace />,
});
