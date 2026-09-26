import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioSettingsPage } from "@/components/settings/LocalStudioSettingsPage";

type SettingsSearch = {
  fixture?: string;
};

export const Route = createFileRoute("/(apps)/settings/themes")({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    fixture: typeof search.fixture === "string" ? search.fixture : undefined,
  }),
  component: ThemesSettingsPage,
});

function ThemesSettingsPage() {
  return <LocalStudioSettingsPage unitId="themes" />;
}
