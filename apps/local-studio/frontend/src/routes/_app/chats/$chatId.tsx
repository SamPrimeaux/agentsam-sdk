import { createFileRoute, Link } from "@tanstack/react-router";
import { ChatWorkspace } from "@/components/shell/chat-workspace";
import { Button } from "@/components/ui/button";
import { useWorkStore } from "@/lib/work/store";

export const Route = createFileRoute("/_app/chats/$chatId")({
  component: ChatPage,
});

function ChatPage() {
  const { chatId } = Route.useParams();
  const chat = useWorkStore((s) => s.chats.find((t) => t.id === chatId));

  if (!chat) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">That chat is not on this device.</p>
        <Button asChild variant="secondary">
          <Link to="/chats">Back to chats</Link>
        </Button>
      </div>
    );
  }

  return <ChatWorkspace chat={chat} />;
}
