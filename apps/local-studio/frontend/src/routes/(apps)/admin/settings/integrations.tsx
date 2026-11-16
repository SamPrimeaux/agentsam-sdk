import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin/settings/integrations")({
  component: LegacyIntegrationsSettingsRoute,
});

function LegacyIntegrationsSettingsRoute() {
  return <Navigate to="/admin/settings/customize" search={{ view: "plugins" }} replace />;
}
