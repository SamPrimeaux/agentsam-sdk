import { createFileRoute } from "@tanstack/react-router";
import { ArtifactsStage } from "@/components/workbench/artifacts";

export const Route = createFileRoute("/_app/artifacts")({
  component: ArtifactsPage,
});

function ArtifactsPage() {
  return (
    <div className="h-full min-h-0">
      <ArtifactsStage />
    </div>
  );
}
