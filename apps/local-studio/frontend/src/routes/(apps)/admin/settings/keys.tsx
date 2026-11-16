import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioSettingsPage } from "@/components/settings/LocalStudioSettingsPage";

type SettingsSearch = {
  view?: string;
  fixture?: string;
};

export const Route = createFileRoute("/(apps)/admin/settings/keys")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    view: typeof search.view === "string" ? search.view : undefined,
    fixture: typeof search.fixture === "string" ? search.fixture : undefined,
  }),
  component: KeysSettingsPage,
});

function KeysSettingsPage() {
  const { view } = Route.useSearch();
  return <LocalStudioSettingsPage unitId="keys" requestedView={view} />;
}
