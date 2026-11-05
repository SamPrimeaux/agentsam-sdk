import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Clock3, MessageSquare } from "lucide-react";
import { loadAccountMessages, type AccountChatMessage } from "@/lib/work/account-chats";

/** Reopen any authorized account session, including DO/R2-originated history.
 * The SDK cannot append turns to the platform DO, so this reader does not
 * present a misleading composer for older platform-owned sessions. */
export function AccountChatReader({ id }: { id: string }) {
  const [name, setName] = useState("Conversation");
  const [messages, setMessages] = useState<AccountChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    setLoading(true);setFailure("");
    void Promise.all([
      fetch("/api/studio/chats/"+encodeURIComponent(id),{credentials:"same-origin",signal:controller.signal})
        .then(response=>response.ok?response.json():null),
      loadAccountMessages(id,controller.signal),
    ]).then(([metadata,history])=>{
      if(controller.signal.aborted)return;
      if(metadata?.chat?.title)setName(metadata.chat.title);
      setMessages(history.messages || []);
      if(history.source==="unavailable")setFailure("This conversation's messages could not be loaded. Please try again.");
    }).catch(()=>{
      if(!controller.signal.aborted)setFailure("We couldn't open this conversation. Please try again.");
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[id,revision]);
  return <div className="flex h-full min-h-0 flex-col bg-background" data-chat-reader="account">
    <header className="flex min-h-14 items-center gap-3 border-b border-border px-4 sm:px-7">
      <Link to="/chats" aria-label="Back to Chats" className="grid size-8 place-items-center rounded-md hover:bg-muted"><ArrowLeft size={17}/></Link>
      <MessageSquare size={17} className="shrink-0 text-muted-foreground"/>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</h1>
      <span className="hidden text-xs text-muted-foreground sm:inline">Account history</span>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-7">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {loading?<p role="status" className="text-sm text-muted-foreground">Opening conversation…</p>:null}
        {failure?<div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
          <span>{failure}</span>
          <button type="button" className="rounded-md border border-border px-3 py-1.5" onClick={()=>setRevision(x=>x+1)}>Retry</button>
        </div>:null}
        {!loading&&!failure&&!messages.length?<p className="py-10 text-center text-sm text-muted-foreground">This conversation has no saved messages.</p>:null}
        {messages.map((message,index)=>{
          const role=message.role==="assistant"?"AgentSam":message.role==="user"?"You":message.role==="tool"?"Tool":"Context";
          const text=typeof message.content==="string"?message.content:"";
          const time=message.ts?Date.parse(message.ts):message.createdAt||null;
          return <article key={message.id||index} className={"rounded-md border p-4 "+(message.role==="user"?"border-border bg-card":"border-transparent bg-muted/30")}>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <strong className="text-foreground">{role}</strong>
              {time&&Number.isFinite(time)?<time className="inline-flex items-center gap-1" dateTime={new Date(time).toISOString()}><Clock3 size={12}/>{new Date(time).toLocaleString()}</time>:null}
            </div>
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text || "No text content in this message."}</div>
          </article>;
        })}
      </div>
    </div>
    <footer className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
      Saved conversation history
    </footer>
  </div>;
}
