import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioSettingsPage } from "@/components/settings/LocalStudioSettingsPage";
import { normalizeSettingsUnit } from "@/components/settings/localStudioSettingsManifest";

type SettingsSearch = {
  view?: string;
  fixture?: string;
  connected?: string;
};

export const Route = createFileRoute("/(apps)/settings/$unit")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    view: typeof search.view === "string" ? search.view : undefined,
    fixture: typeof search.fixture === "string" ? search.fixture : undefined,
    connected: typeof search.connected === "string"
      && /^[a-z0-9][a-z0-9_.-]{1,100}$/i.test(search.connected)
      ? search.connected : undefined,
  }),
  component: SettingsUnitRoute,
});

function SettingsUnitRoute() {
  const { unit } = Route.useParams();
  const { view, connected } = Route.useSearch();
  return (
    <LocalStudioSettingsPage
      unitId={normalizeSettingsUnit(unit)}
      requestedView={view}
      connectedPluginKey={connected}
    />
  );
}
