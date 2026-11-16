import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/docs")({
  component: () => <Navigate to="/admin/docs" search={true} replace />,
});
