import { createFileRoute } from "@tanstack/react-router";
import { DeployStage } from "@/components/workbench/deploy";

export const Route = createFileRoute("/_app/ship")({
  component: ShipPage,
});

function ShipPage() {
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <DeployStage />
    </div>
  );
}
