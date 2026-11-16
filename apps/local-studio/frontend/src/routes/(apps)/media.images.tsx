import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/media/images")({
  component: () => <Navigate to="/admin/media/images" search={true} replace />,
});
