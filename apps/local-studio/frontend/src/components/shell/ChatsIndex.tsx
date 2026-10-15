import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, MessageSquare, Plus, Search, Pin, FolderKanban, CheckCircle2 } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";

type Filter = "all" | "pinned" | "unassigned";

/** A presentation of the EXISTING persisted Studio conversations.
 * No new chat state, IAM data, or secondary project registry. */
export function ChatsIndex() {
  const navigate = useNavigate();
  const chats = useWorkStore((state) => state.trails);
  const projects = useWorkStore((state) => state.projects);
  const activeProjectId = useWorkStore((state) => state.activeProjectId);
  const startChat = useWorkStore((state) => state.startTrail);
  const pinChat = useWorkStore((state) => state.pinTrail);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const visible = useMemo(() => chats
    .filter((chat) => filter === "pinned" ? chat.pinned : filter === "unassigned" ? !chat.workProjectId : true)
    .filter((chat) => {
      const term = search.trim().toLocaleLowerCase();
      return !term || chat.title.toLocaleLowerCase().includes(term) ||
        chat.messages.some((msg) => msg.content.toLocaleLowerCase().includes(term));
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [chats, search, filter]);

  function open(id: string) {
    void navigate({ to: "/chats/$chatId", params: { chatId: id } });
  }

  return (
    <div className="h-full overflow-y-auto bg-background" data-studio-chats="index">
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 pb-28 sm:px-7 md:py-9">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to="/projects" className="mb-4 inline-flex min-h-9 items-center gap-2 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground">
              <FolderKanban className="size-4" /> Projects
            </Link>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Local Studio</p>
            <h1 className="text-3xl font-bold tracking-tight">Chats</h1>
            <p className="mt-2 text-sm text-muted-foreground">Conversations, projects, and continuing work in one place.</p>
          </div>
          <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground"
            onClick={() => open(startChat())}><Plus className="size-4"/> New chat</button>
        </header>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-h-11 min-w-[190px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="size-4 text-muted-foreground"/>
            <input className="w-full bg-transparent text-sm outline-none" aria-label="Search chats" placeholder="Search your conversations…" value={search} onChange={(event) => setSearch(event.target.value)}/>
          </label>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1" role="group" aria-label="Chat filters">
            {([["all", "All"], ["pinned", "Pinned"], ["unassigned", "Unassigned"]] as const).map(([key, text]) =>
              <button key={key} type="button" className={"min-h-9 rounded-lg px-3 text-xs font-semibold " + (filter === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted")} aria-pressed={filter === key} onClick={() => setFilter(key)}>{text}</button>)}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Conversations <span className="ml-1 text-muted-foreground">({visible.length})</span></h2>
          <span className="text-xs text-muted-foreground">From this Studio</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((chat) => {
            const projectName = projects.find((project) => project.id === chat.projectId)?.name || "Studio";
            return <article key={chat.id} data-linked-to-work={chat.workProjectId ? "yes" : "no"} className="group relative rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-accent/50">
              <button type="button" className="flex w-full min-h-24 items-start gap-3 pr-8 text-left" onClick={() => open(chat.id)}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent"><MessageSquare className="size-5"/></span>
                <span className="min-w-0 flex-1">
                  <strong className="mb-1 block line-clamp-2 break-words text-sm font-semibold">{chat.title}</strong>
                  <span className="block line-clamp-2 text-xs leading-5 text-muted-foreground">{(chat.messages.filter((msg) => msg.role !== "system").at(-1)?.content || "Ready for your first message").slice(0, 148)}</span>
                </span>
                <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground"/>
              </button>
              <footer className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                <FolderKanban className="size-3.5"/><span className="max-w-[155px] truncate">{projectName}</span>
                {chat.workProjectId ? <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-accent"><CheckCircle2 className="size-3"/> Linked to Work</span> : null}
                <span className="ml-auto whitespace-nowrap">{chat.messages.length} messages</span>
              </footer>
              <button type="button" className={"absolute right-3 top-12 grid size-9 place-items-center rounded-lg " + (chat.pinned ? "text-accent" : "text-muted-foreground hover:text-accent")}
                aria-label={(chat.pinned ? "Unpin " : "Pin ") + chat.title} onClick={() => pinChat(chat.id)}><Pin className="size-4"/></button>
            </article>;
          })}
        </div>
        {!visible.length ? <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <MessageSquare className="mx-auto mb-3 size-8 text-muted-foreground"/>
          <h3 className="text-sm font-semibold">{search ? "No matching conversations" : "No chats in this view"}</h3>
          <p className="mt-2 text-xs text-muted-foreground">{search ? "Try a different search." : "Create a new chat or choose another filter."}</p>
        </div> : null}
        <p className="text-xs leading-5 text-muted-foreground">Chat history remains in Local Studio's existing store. Linking a chat to a Work project does not change its original Studio workspace.</p>
      </div>
    </div>
  );
}
