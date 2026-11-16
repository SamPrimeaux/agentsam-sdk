import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/cad")({
  component: () => <Navigate to="/admin/cad" replace />,
});
