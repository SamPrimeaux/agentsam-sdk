import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/forms")({
  component: () => <Navigate to="/admin/forms" search={true} replace />,
});
