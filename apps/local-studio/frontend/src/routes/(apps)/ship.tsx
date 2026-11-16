import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/ship")({
  component: () => <Navigate to="/admin/ship" search={true} replace />,
});
