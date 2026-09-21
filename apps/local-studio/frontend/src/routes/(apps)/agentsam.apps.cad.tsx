import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/agentsam/apps/cad")({
  component: () => <Navigate to="/cad" replace />,
});
