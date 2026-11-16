import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/help/cms")({
  component: () => <Navigate to="/admin/help/cms" search={true} replace />,
});
