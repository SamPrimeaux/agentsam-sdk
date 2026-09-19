import { createFileRoute } from "@tanstack/react-router";
import { AppPreviewStage } from "@/components/workbench/app-preview-stage";

export const Route = createFileRoute("/_app/agentsam/apps/cad")({
  component: CadAppPreviewPage,
});

function CadAppPreviewPage() {
  return (
    <div className="size-full overflow-hidden bg-background">
      <AppPreviewStage
        appId="cad-creator"
        initialUrl="http://localhost:3000?presentation=embedded"
      />
    </div>
  );
}
