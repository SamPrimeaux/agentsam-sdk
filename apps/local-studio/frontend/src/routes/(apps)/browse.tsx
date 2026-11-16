import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/browse")({
  component: () => <Navigate to="/admin/browse" search={true} replace />,
});
