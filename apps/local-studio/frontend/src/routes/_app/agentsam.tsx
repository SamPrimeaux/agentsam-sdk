import { createFileRoute } from "@tanstack/react-router";
import { ChatWorkspace } from "@/components/shell/chat-workspace";
import { useWorkStore } from "@/lib/work/store";

export const Route = createFileRoute("/_app/agentsam")({ component: AgentSamAdmin });

function AgentSamAdmin() {
  const chat = useWorkStore((s) => s.chats.find((t) => t.id === "chat-studio") ?? s.chats[0]);

  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No chats yet.
      </div>
    );
  }

  return <ChatWorkspace chat={chat} />;
}
