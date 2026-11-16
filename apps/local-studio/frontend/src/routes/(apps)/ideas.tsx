import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/ideas")({
  component: () => <Navigate to="/admin/ideas" search={true} replace />,
});
