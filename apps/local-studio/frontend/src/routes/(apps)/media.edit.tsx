import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/media/edit")({
  component: () => <Navigate to="/admin/media/edit" search={true} replace />,
});
