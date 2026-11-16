import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioSettingsPage } from "@/components/settings/LocalStudioSettingsPage";

type SettingsSearch = {
  view?: string;
  fixture?: string;
};

export const Route = createFileRoute("/(apps)/admin/settings/themes")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    view: typeof search.view === "string" ? search.view : undefined,
    fixture: typeof search.fixture === "string" ? search.fixture : undefined,
  }),
  component: ThemesSettingsPage,
});

function ThemesSettingsPage() {
  const { view } = Route.useSearch();
  return <LocalStudioSettingsPage unitId="themes" requestedView={view} />;
}
