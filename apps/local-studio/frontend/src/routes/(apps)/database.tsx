import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/database")({
  component: () => <Navigate to="/admin/database" search={true} replace />,
});
