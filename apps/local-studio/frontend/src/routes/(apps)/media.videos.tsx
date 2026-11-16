import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/media/videos")({
  component: () => <Navigate to="/admin/media/videos" replace />,
});
