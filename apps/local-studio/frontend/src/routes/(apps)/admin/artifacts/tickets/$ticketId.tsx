import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/admin/artifacts/tickets/$ticketId")({
  component: ArtifactTicketDetailRoute,
});

function ArtifactTicketDetailRoute() {
  const { ticketId } = Route.useParams();
  return <LocalStudioWorkPage surface="artifact-tickets" ticketId={ticketId} />;
}
