import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/agentsam/apps/cad")({
  component: () => <Navigate to="/cad" replace />,
});
