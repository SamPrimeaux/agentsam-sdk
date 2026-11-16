import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/chats/")({
  component: () => <Navigate to="/admin/chats" replace />,
});
