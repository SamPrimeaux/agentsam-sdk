import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/sites")({
  component: () => <Navigate to="/admin/sites" search={true} replace />,
});
