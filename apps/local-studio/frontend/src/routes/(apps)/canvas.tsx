import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/canvas")({
  component: () => <Navigate to="/admin/canvas" search={true} replace />,
});
