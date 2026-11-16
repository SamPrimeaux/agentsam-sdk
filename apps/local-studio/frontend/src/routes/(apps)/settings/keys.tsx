import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/settings/keys")({
  component: () => <Navigate to="/admin/settings/keys" search={true} replace />,
});
