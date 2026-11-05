import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, ArrowDownUp, Check, Clock3, FolderKanban, ListFilter, MessageSquare, MoreHorizontal, Pin, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";
import { listAccountChats, patchAccountChat, trashAccountChat, type AccountChat } from "@/lib/work/account-chats";

type ChatRow = AccountChat & { local?: boolean };
const formatted = (seconds: number) => new Date(seconds * 1000).toLocaleDateString(undefined, {month:"short",day:"numeric",year:"numeric"});
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Account-wide sessions, with unimported V1 conversations shown until safely synchronized. */
export function ChatsIndex() {
  const navigate = useNavigate();
  const chats = useWorkStore(state => state.chats);
  const [remote, setRemote] = useState<AccountChat[]>([]);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<"active"|"archived"|"trashed">("active");
  const [kind, setKind] = useState("chat");
  const [sort, setSort] = useState<"recent"|"oldest">("recent");
  const [period, setPeriod] = useState("all");
  const [group, setGroup] = useState("date");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [projects, setProjects] = useState<Array<{id:string;name:string}>>([]);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 230);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    void import("@/components/work/LocalStudioWorkPage")
      .then(({sharedLiveWorkHost})=>sharedLiveWorkHost().snapshot({surface:"projects"}))
      .then(snapshot=>setProjects(snapshot.projects.map(project=>({id:project.id,name:project.name}))))
      .catch(()=>{}); // Project filter remains absent if provider is unavailable.
  }, []);
  useEffect(() => {
    const refresh = () => setRevision(value=>value+1);
    window.addEventListener("agentsam:chats-changed", refresh);
    return () => window.removeEventListener("agentsam:chats-changed", refresh);
  }, []);
  useEffect(() => {
    setOffset(0); setRemote([]); setSelected(new Set());
  }, [debounced,status,kind,sort,period]);
  const since = period === "week" ? nowSeconds() - 7*86400 : period === "month" ? nowSeconds() - 30*86400 : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); loadingRef.current=true; setFailure("");
    listAccountChats({q:debounced,status,kind,sort,limit:60,offset,since},controller.signal)
      .then(page=>{
        if (controller.signal.aborted) return;
        setRemote(rows=>offset===0?page.chats:[
          ...rows, ...page.chats.filter(chat=>!rows.some(item=>item.id===chat.id))
        ]);
        setHasMore(page.hasMore);
      })
      .catch(error=>{
        if (!controller.signal.aborted) setFailure(error instanceof Error ? error.message : "Could not load conversations.");
      })
      .finally(()=>{if(!controller.signal.aborted){setLoading(false);loadingRef.current=false;}});
    return ()=>controller.abort();
  },[debounced,status,kind,sort,period,offset,revision]);

  const rows = useMemo<ChatRow[]>(()=>{
    const remoteIds = new Set(remote.map(chat=>chat.id));
    const local: ChatRow[] = status==="active" && kind==="chat" ? chats.filter(chat=>
      chat.id !== "chat-studio" && chat.messages.some(message=>message.role==="user") &&
      !remoteIds.has(chat.id) && (!debounced || chat.title.toLowerCase().includes(debounced.toLowerCase()))
    ).map(chat=>({
      id:chat.id,title:chat.title,projectId:chat.workProjectId||null,
      workspaceId:null,pinned:Boolean(chat.pinned),updatedAt:Math.floor(chat.updatedAt/1000),
      createdAt:Math.floor(chat.createdAt/1000),messageCount:chat.messages.length,
      artifactCount:chat.files.length,lastTurnStatus:null,state:"active" as const,kind:"chat" as const,
      origin:"studio" as const,local:true
    })).filter(chat=>!since || chat.updatedAt>=since) : [];
    return [...remote,...local].sort((a,b)=>Number(b.pinned)-Number(a.pinned) ||
      (sort==="oldest" ? a.updatedAt-b.updatedAt : b.updatedAt-a.updatedAt));
  },[remote,chats,status,kind,debounced,sort,since]);
  const selectedRows = rows.filter(row=>selected.has(row.id));
  const groupName = (row:ChatRow) => group==="project" ?
    projects.find(project=>project.id===row.projectId)?.name || "Unassigned" :
    group==="none" ? "Conversations" :
    new Date(row.updatedAt*1000).toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const grouped = useMemo(()=>{
    const groups = new Map<string,ChatRow[]>();
    for (const row of rows){const key=groupName(row);groups.set(key,[...(groups.get(key)||[]),row]);}
    return [...groups];
  },[rows,group,projects]);

  const refresh = () => {setRevision(value=>value+1);window.dispatchEvent(new Event("agentsam:chats-changed"));};
  const change = async (row:ChatRow,patch:Partial<Pick<AccountChat,"title"|"pinned"|"state"|"projectId">>)=>{
    try{
      if(row.local){
        if(patch.title!==undefined)useWorkStore.getState().renameChat(row.id,patch.title);
        if(patch.pinned!==undefined)useWorkStore.getState().pinChat(row.id);
        if(patch.projectId!==undefined)useWorkStore.getState().assignChatToWorkProject(row.id,patch.projectId);
        if(patch.state==="trashed")useWorkStore.getState().deleteChat(row.id);
        if(patch.state==="archived")throw Error("Save this conversation to your account before archiving.");
      }else await patchAccountChat(row.id,patch);
      refresh();
    }catch(error){setFailure(error instanceof Error?error.message:"We couldn't finish that. Please try again.");}
  };
  const remove = async (row:ChatRow)=>{
    try {
      if (row.local) useWorkStore.getState().deleteChat(row.id);
      else await trashAccountChat(row.id);
      setSelected(prev=>{const next=new Set(prev);next.delete(row.id);return next;});
      refresh();
    } catch {setFailure("We couldn't delete that conversation. Please try again.");}
  };
  const saveName = (row:ChatRow)=>{if(draftTitle.trim())void change(row,{title:draftTitle.trim()});setEditing(null);};
  const bulk = async (next:"archived"|"trashed"|"active")=>{
    for(const row of selectedRows){
      if(next==="trashed")await remove(row);
      else await change(row,{state:next});
    }
    setSelected(new Set());
  };
  const open = (id:string)=>void navigate({to:"/chats/$chatId",params:{chatId:id}});
  const requestMore = useCallback(()=>{
    if (!loadingRef.current && hasMore && !failure) setOffset(value=>value+60);
  },[hasMore,failure]);
  useEffect(()=>{
    const target=sentinel.current;
    if(!target || !hasMore)return;
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))requestMore();},{rootMargin:"360px"});
    observer.observe(target);return()=>observer.disconnect();
  },[hasMore,requestMore]);

  return <div className="h-full min-h-0 overflow-y-auto bg-background" data-studio-chats="account-history">
    <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-24 sm:px-7">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
          <p className="mt-1 text-xs text-muted-foreground">Account conversations and continuing work.</p></div>
        <span className="text-xs text-muted-foreground">{rows.length} loaded{hasMore ? " · More available" : ""}</span>
      </header>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-48 flex-1 items-center gap-2 rounded-md border border-border bg-card px-3">
          <Search size={15} className="shrink-0 text-muted-foreground"/>
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Search conversations" aria-label="Search account conversations"/>
          {query?<button type="button" aria-label="Clear search" onClick={()=>setQuery("")}><X size={14}/></button>:null}
        </label>
        <label className="flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground"><ListFilter size={14}/>
          <select aria-label="Conversation status" className="bg-transparent text-foreground outline-none" value={status} onChange={e=>setStatus(e.target.value as typeof status)}>
            <option value="active">Active</option><option value="archived">Archived</option><option value="trashed">Trash</option>
          </select>
        </label>
        <label className="flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground">
          <select aria-label="Conversation type" className="bg-transparent text-foreground outline-none" value={kind} onChange={e=>setKind(e.target.value)}>
            <option value="chat">Chats</option><option value="side_chat">Side chats</option><option value="subagent">Tasks</option>
          </select>
        </label>
        <label className="flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground"><Clock3 size={14}/>
          <select aria-label="Last activity" className="bg-transparent text-foreground outline-none" value={period} onChange={e=>setPeriod(e.target.value)}>
            <option value="all">Any time</option><option value="week">Past week</option><option value="month">Past month</option>
          </select>
        </label>
        <label className="flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground"><ArrowDownUp size={14}/>
          <select aria-label="Sort conversations" className="bg-transparent text-foreground outline-none" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}>
            <option value="recent">Recent first</option><option value="oldest">Oldest first</option>
          </select>
        </label>
        <label className="flex h-9 items-center rounded-md border border-border px-2 text-xs text-muted-foreground">
          <select aria-label="Group conversations" className="bg-transparent text-foreground outline-none" value={group} onChange={e=>setGroup(e.target.value)}>
            <option value="date">Group by month</option><option value="project">Group by project</option><option value="none">No grouping</option>
          </select>
        </label>
      </div>
      {selected.size>0?<div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 text-xs">
        <strong className="px-2">{selected.size} selected</strong>
        <button className="rounded-md px-2 py-1.5 hover:bg-muted" onClick={()=>void bulk(status==="archived"?"active":"archived")}>{status==="archived"?"Restore":"Archive"}</button>
        <button className="rounded-md px-2 py-1.5 text-destructive hover:bg-muted" onClick={()=>void bulk("trashed")}>Delete</button>
        <button className="ml-auto px-2 py-1.5" onClick={()=>setSelected(new Set())}>Clear</button>
      </div>:null}
      {failure?<div role="alert" className="mb-3 flex items-center justify-between rounded-md border border-border p-3 text-sm">
        <span>{failure}</span><button className="rounded-md border border-border px-3 py-1" onClick={()=>setRevision(x=>x+1)}>Retry</button>
      </div>:null}
      {!rows.length && !loading && !failure?<div className="py-16 text-center text-sm text-muted-foreground">
        {query?"No matching conversations.":"No conversations in this view."}
      </div>:null}
      {grouped.map(([section,items])=><section key={section} aria-label={section} className="mb-5">
        <h2 className="mb-1 border-b border-border/70 pb-2 text-xs font-medium text-muted-foreground">{section}</h2>
        <div className="divide-y divide-border/60">
          {items.map(chat=><article key={chat.id} className="group flex min-h-12 items-center gap-2 rounded-md px-1 transition-colors hover:bg-muted/50 focus-within:bg-muted/50">
            <input type="checkbox" aria-label={"Select "+chat.title} checked={selected.has(chat.id)}
              onChange={e=>setSelected(current=>{const next=new Set(current);if(e.target.checked)next.add(chat.id);else next.delete(chat.id);return next;})}
              className="size-4 shrink-0 accent-current"/>
            <MessageSquare size={15} className="shrink-0 text-muted-foreground"/>
            {editing===chat.id?<form className="flex min-w-0 flex-1 gap-2" onSubmit={e=>{e.preventDefault();saveName(chat);}}>
              <input autoFocus value={draftTitle} onChange={e=>setDraftTitle(e.target.value)}
                maxLength={160} aria-label="Rename conversation" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm"/>
              <button type="submit" aria-label="Save name"><Check size={16}/></button>
              <button type="button" aria-label="Cancel rename" onClick={()=>setEditing(null)}><X size={16}/></button>
            </form>:<button type="button" className="min-w-0 flex-1 truncate py-3 text-left text-sm font-medium" onClick={()=>open(chat.id)}
              title={chat.title}>{chat.title}</button>}
            {chat.pinned?<Pin size={13} className="shrink-0 text-muted-foreground"/>:null}
            {chat.projectId?<span title={projects.find(p=>p.id===chat.projectId)?.name||"Linked project"} className="hidden max-w-32 truncate text-xs text-muted-foreground md:block"><FolderKanban size={12} className="mr-1 inline"/> {projects.find(p=>p.id===chat.projectId)?.name||"Project"}</span>:null}
            {chat.local?<span className="hidden text-[11px] text-muted-foreground sm:block">On this device</span>:null}
            <time className="hidden shrink-0 text-xs text-muted-foreground sm:block" dateTime={new Date(chat.updatedAt*1000).toISOString()}>{formatted(chat.updatedAt)}</time>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button type="button" aria-label={chat.title+" options"} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><MoreHorizontal size={16}/></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={5} collisionPadding={12} className="z-[100] min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl">
                <DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent" onSelect={()=>{setEditing(chat.id);setDraftTitle(chat.title);}}>Rename</DropdownMenu.Item>
                <DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent" onSelect={()=>void change(chat,{pinned:!chat.pinned})}>{chat.pinned?"Unpin":"Pin"}</DropdownMenu.Item>
                {projects.length>0?<DropdownMenu.Sub><DropdownMenu.SubTrigger className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent">Assign to project</DropdownMenu.SubTrigger>
                  <DropdownMenu.Portal><DropdownMenu.SubContent sideOffset={6} className="z-[101] max-h-72 min-w-48 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
                    <DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent" onSelect={()=>void change(chat,{projectId:null})}>Unassigned</DropdownMenu.Item>
                    {projects.map(project=><DropdownMenu.Item key={project.id} className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent" onSelect={()=>void change(chat,{projectId:project.id})}>{project.name}</DropdownMenu.Item>)}
                  </DropdownMenu.SubContent></DropdownMenu.Portal></DropdownMenu.Sub>:null}
                <DropdownMenu.Separator className="my-1 h-px bg-border"/>
                {chat.state!=="archived"?<DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent" onSelect={()=>void change(chat,{state:"archived"})}><Archive size={13} className="mr-2 inline"/>Archive</DropdownMenu.Item>:
                  <DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent" onSelect={()=>void change(chat,{state:"active"})}><RotateCcw size={13} className="mr-2 inline"/>Restore</DropdownMenu.Item>}
                {chat.state!=="trashed"?<DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-xs text-destructive outline-none focus:bg-accent" onSelect={()=>void remove(chat)}><Trash2 size={13} className="mr-2 inline"/>Delete</DropdownMenu.Item>:
                  <DropdownMenu.Item className="cursor-pointer rounded px-3 py-2 text-xs outline-none focus:bg-accent" onSelect={()=>void change(chat,{state:"active"})}>Restore from trash</DropdownMenu.Item>}
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          </article>)}
        </div>
      </section>)}
      {loading?<p role="status" className="py-6 text-center text-xs text-muted-foreground">Loading conversations…</p>:null}
      <div ref={sentinel} className="h-1" aria-hidden="true"/>
      {hasMore && !loading?<button type="button" onClick={requestMore} className="mx-auto block rounded-md border border-border px-4 py-2 text-xs hover:bg-muted">Load more conversations</button>:null}
    </div>
  </div>;
}
