import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
type SettingsPageType = typeof import("@/components/settings/LocalStudioSettingsPage").LocalStudioSettingsPage;
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
  // The Settings frontend has browser-only dependencies: client-hydrate them
  // instead of importing them into the hosted SSR module graph.
  const [Page, setPage] = useState<SettingsPageType | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    let active = true;
    import("@/components/settings/LocalStudioSettingsPage")
      .then(module => { if (active) setPage(() => module.LocalStudioSettingsPage); })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, []);
  if (!Page) return (
    <main className="mx-auto w-full max-w-5xl p-6 text-white" role="status">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-white/70">
        {loadFailed ? "Settings could not load. Refresh this page to retry." : "Loading your settings…"}
      </p>
    </main>
  );
  return (
    <Page
      unitId={normalizeSettingsUnit(unit)}
      requestedView={view}
      connectedPluginKey={connected}
    />
  );
}
