import { createFileRoute } from "@tanstack/react-router";
import { AppPreviewStage } from "@/components/workbench/app-preview-stage";
import {useNav} from "@inneranimalmedia/agentsam-nav";
import {CadConversationPane} from "@/components/workbench/CadConversationPane";

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
  const {data} = useNav();
  const chatOpen = data.mode === "chat";
  const search = Route.useSearch();
  const initialUrl = resolveCadInitialUrl(search.url);

  return (
    <div className="flex size-full min-h-0 overflow-hidden bg-background">
      {chatOpen && <CadConversationPane />}
      <div className={"min-w-0 flex-1 "+(chatOpen?"hidden md:block":"block")}>
        <AppPreviewStage appId="cad-creator" initialUrl={initialUrl} />
      </div>
    </div>
  );
}
