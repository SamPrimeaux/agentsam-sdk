import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioSettingsPage } from "@/components/settings/LocalStudioSettingsPage";

type SettingsSearch = { view?: string };

export const Route = createFileRoute("/(apps)/admin/settings/runtime")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    view: typeof search.view === "string" ? search.view : undefined,
  }),
  component: RuntimeSettingsPage,
});

function RuntimeSettingsPage() {
  const { view } = Route.useSearch();
  return <LocalStudioSettingsPage unitId="runtime" requestedView={view} />;
}
