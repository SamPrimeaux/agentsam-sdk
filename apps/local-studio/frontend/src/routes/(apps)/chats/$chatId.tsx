import { createFileRoute } from "@tanstack/react-router";
import { AgentSamPage } from "../../../../agentsam/AgentSamPage";
import { AccountChatReader } from "@/components/shell/AccountChatReader";
import { useWorkStore } from "@/lib/work/store";
export const Route = createFileRoute("/(apps)/chats/$chatId")({ component: ChatPage });
function ChatPage() {
  const { chatId } = Route.useParams();
  const canContinueHere = useWorkStore(state => state.chats.some(item => item.id === chatId));
  return canContinueHere ? <AgentSamPage conversationId={chatId} /> : <AccountChatReader id={chatId} />;
}
