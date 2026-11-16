import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/content")({
  component: () => <Navigate to="/admin/content" search={true} replace />,
});
