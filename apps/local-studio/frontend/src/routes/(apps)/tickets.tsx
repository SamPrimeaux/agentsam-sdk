import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/tickets")({
  component: () => <Navigate to="/admin/tickets" replace />,
});
