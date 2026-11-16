import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/chats/$chatId")({ component: LegacyChatRoute });

function LegacyChatRoute() {
  const { chatId } = Route.useParams();
  return <Navigate to="/admin/chats/$chatId" params={{ chatId }} search={true} replace />;
}
