import { createFileRoute } from "@tanstack/react-router";
import { AppPreviewStage } from "@/components/workbench/app-preview-stage";

interface CadSearchParams {
  url?: string;
  workspace?: string;
}

export const Route = createFileRoute("/_app/cad")({
  validateSearch: (search: Record<string, unknown>): CadSearchParams => {
    return {
      url: typeof search.url === "string" ? search.url : undefined,
      workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    };
  },
  component: CadStudioPage,
});

function resolveCadInitialUrl(overrideUrl?: string): string {
  if (overrideUrl) return overrideUrl;
  if (typeof window !== "undefined") {
    const envUrl = (import.meta as any).env?.VITE_CAD_CREATOR_URL;
    if (envUrl) return envUrl;
  }
  return "/cad-creator/index.html?presentation=embedded";
}

function CadStudioPage() {
  const search = Route.useSearch();
  const initialUrl = resolveCadInitialUrl(search.url);

  return (
    <div className="size-full overflow-hidden bg-background">
      <AppPreviewStage
        appId="cad-creator"
        initialUrl={initialUrl}
      />
    </div>
  );
}
