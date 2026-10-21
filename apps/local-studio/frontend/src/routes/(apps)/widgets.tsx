import { createFileRoute, Navigate } from "@tanstack/react-router";

// Widget controls are app primitives configured in Settings, not a destination.
export const Route = createFileRoute("/(apps)/widgets")({
  component: () => <Navigate to="/settings" replace />,
});
