import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/artifacts/tickets/")({
  component: ArtifactTicketsRoute,
});

function ArtifactTicketsRoute() {
  return <LocalStudioWorkPage surface="artifact-tickets" />;
}
