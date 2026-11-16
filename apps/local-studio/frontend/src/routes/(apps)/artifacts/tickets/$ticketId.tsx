import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/artifacts/tickets/$ticketId")({ component: LegacyTicketRoute });

function LegacyTicketRoute() {
  const { ticketId } = Route.useParams();
  return <Navigate to="/admin/artifacts/tickets/$ticketId" params={{ ticketId }} search={true} replace />;
}
