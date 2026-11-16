import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/artifacts/tickets/")({
  component: () => <Navigate to="/admin/artifacts/tickets" search={true} replace />,
});
