import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/apps/ecommerce-cms-agentsam")({
  component: () => <Navigate to="/admin/apps/ecommerce-cms-agentsam" search={true} replace />,
});
