import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/library")({
  component: () => <Navigate to="/admin/library" search={true} replace />,
});
