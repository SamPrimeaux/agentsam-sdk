import { createFileRoute } from "@tanstack/react-router";
import { AgentSamAnalyticsPage } from "@inneranimalmedia/agentsam-analytics/frontend";
import "@inneranimalmedia/agentsam-analytics/theme.css";

export const Route = createFileRoute("/(apps)/admin/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return <AgentSamAnalyticsPage />;
}
