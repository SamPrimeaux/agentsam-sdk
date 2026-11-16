import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/settings/runtime")({
  component: () => <Navigate to="/admin/settings/runtime" search={true} replace />,
});
