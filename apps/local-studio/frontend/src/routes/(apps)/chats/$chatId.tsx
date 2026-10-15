import { createFileRoute } from "@tanstack/react-router";
import { AgentSamPage } from "../../../../agentsam/AgentSamPage";
export const Route = createFileRoute("/(apps)/chats/$chatId")({ component: ChatPage });
function ChatPage() { const { chatId } = Route.useParams(); return <AgentSamPage conversationId={chatId} />; }
