import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/cms")({
  component: () => <Navigate to="/admin/store" search={(previous) => previous} replace />,
});
