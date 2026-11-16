import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/goalguru")({
  component: () => <Navigate to="/admin/goalguru" replace />,
});
