import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/themes")({
  component: () => <Navigate to="/admin/themes" search={true} replace />,
});
