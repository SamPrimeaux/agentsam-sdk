import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/files")({
  component: () => <Navigate to="/admin/files" replace />,
});
