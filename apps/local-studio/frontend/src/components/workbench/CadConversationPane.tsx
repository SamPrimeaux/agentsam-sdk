import { useWorkStore } from "@/lib/work/store";
import { MessageList } from "@/components/workbench/thread";
import { Composer } from "@/components/workbench/composer";

/** Host-owned conversation, not a CAD-specific chatbot or a second history store. */
/** Host-owned conversation shared by CAD and SamSketch; history and sending remain in Local Studio. */
export function WorkspaceConversationPane({workspace,selected}: {workspace:string;selected?:string}) {
  const chat = useWorkStore(s=>s.chats.find(t=>t.id===s.activeChatId) ?? s.chats[0]);
  const streaming = useWorkStore(s=>chat ? s.streamingIds.includes(chat.id) : false);
  return <section className="flex h-full w-full min-h-0 shrink-0 flex-col bg-background"
    aria-label={"AgentSam conversation for "+workspace+" workspace"}>
    <header className="shrink-0 border-b border-border px-4 py-3">
      <strong className="text-sm font-semibold">AgentSam</strong>
      <div className="mt-1 text-xs text-muted-foreground">{selected ? "Selected "+workspace+" element: "+selected : "Select an object to attach its context to your request"}</div>
    </header>
    {chat ? <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <MessageList messages={chat.messages} chatId={chat.id} streaming={streaming} />
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <Composer targetId={chat.id} targetKind="chat" placeholder={"Work with AgentSam on "+workspace+"…"} />
      </div>
    </> : <div role="status" className="p-4 text-sm text-muted-foreground">Start an AgentSam conversation to continue.</div>}
  </section>;
}

export function CadConversationPane({selected}: {selected?:string}) {
  return <WorkspaceConversationPane workspace="CAD Creator" selected={selected} />;
}
