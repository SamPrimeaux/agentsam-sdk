import { createFileRoute } from "@tanstack/react-router";
import { TrailsPanel } from "@/components/shell/studio-panels";

export const Route = createFileRoute("/_app/trails/")({
  component: TrailsPage,
});

function TrailsPage() {
  return (
    <div className="h-full min-h-0">
      <TrailsPanel />
    </div>
  );
}
