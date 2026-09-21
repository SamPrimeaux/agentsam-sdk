import { createFileRoute } from "@tanstack/react-router";

interface CadSearchParams {
  url?: string;
  workspace?: string;
}

export const Route = createFileRoute("/(apps)/cad")({
  validateSearch: (search: Record<string, unknown>): CadSearchParams => {
    return {
      url: typeof search.url === "string" ? search.url : undefined,
      workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    };
  },
  component: CadStudioPage,
});

function CadStudioPage() {
  return (
    <div className="size-full overflow-hidden bg-background">
      <iframe title="CAD Creator" src="/cad-creator/index.html?presentation=embedded" className="size-full border-0" allow="fullscreen" />
    </div>
  );
}
