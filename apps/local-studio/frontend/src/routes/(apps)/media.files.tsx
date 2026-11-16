import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/media/files")({
  component: () => <Navigate to="/admin/media/files" search={true} replace />,
});
