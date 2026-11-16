import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/mail")({
  component: () => <Navigate to="/admin/mail" search={true} replace />,
});
