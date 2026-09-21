import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsGrid } from "@/components/settings/IntegrationsGrid";

export const Route = createFileRoute("/(apps)/settings/integrations")({
  component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
  return <IntegrationsGrid />;
}
