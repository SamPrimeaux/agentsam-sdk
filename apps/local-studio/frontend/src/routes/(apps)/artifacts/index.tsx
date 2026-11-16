import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/artifacts/")({
  component: () => <Navigate to="/admin/artifacts" search={true} replace />,
});
