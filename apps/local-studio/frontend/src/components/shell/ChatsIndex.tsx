import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, Check, CheckSquare, ChevronRight, Copy, FolderKanban, ListFilter, MoreHorizontal, Pencil, Pin, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";
import { listAccountChats, patchAccountChat, trashAccountChat, type AccountChat } from "@/lib/work/account-chats";

type ChatRow = AccountChat & { local?: boolean };
const activityLabel = (seconds: number) => {
  const delta = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (delta < 60) return "Just now";
  if (delta < 3600) { const minutes = Math.floor(delta / 60); return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`; }
  if (delta < 86400) { const hours = Math.floor(delta / 3600); return `${hours} ${hours === 1 ? "hour" : "hours"} ago`; }
  if (delta < 172800) return "Yesterday";
  if (delta < 7 * 86400) return `${Math.floor(delta / 86400)} days ago`;
  return new Date(seconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(seconds * 1000).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
const menuItem = "flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] leading-[18px] outline-none focus:bg-white/10 data-[highlighted]:bg-white/10";
const menuPanel = "z-[100] min-w-[224px] rounded-lg border border-[#414246] bg-[#242527] p-1.5 text-[#e9e9ea] shadow-[0_12px_32px_#0009] outline-none";
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
  const [group, setGroup] = useState("none");
  const [selectMode, setSelectMode] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
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
    return [...remote,...local].sort((a,b)=>
      (sort==="oldest" ? a.updatedAt-b.updatedAt : b.updatedAt-a.updatedAt) || a.id.localeCompare(b.id));
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
    setSelectMode(false);
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

  return <div className="as-chats h-full min-h-0 overflow-y-auto bg-background" data-studio-chats="account-history">
    <div className="mx-auto w-full max-w-[940px] px-5 pb-24 pt-7 sm:px-9">
      <header className="mb-7 flex items-center justify-between gap-5">
        <h1 className="min-w-0 text-[25px] font-semibold tracking-[-.025em] text-foreground sm:text-[27px]">Chats and tasks</h1>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" aria-label={searchOpen ? "Close conversation search" : "Search conversations"}
            title="Search conversations" aria-expanded={searchOpen} onClick={()=>setSearchOpen(open=>!open)}
            className="grid size-8 place-items-center rounded-md text-foreground/75 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Search size={17}/></button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><button type="button" aria-label="Filter and sort chats" title="Filter and sort chats"
              className="grid size-8 place-items-center rounded-md text-foreground/75 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><ListFilter size={17}/></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} collisionPadding={12}
              className={menuPanel+" w-[254px] p-3"}>
              <DropdownMenu.Label className="mb-3 px-1 text-[13px] font-semibold">Filter and sort</DropdownMenu.Label>
              <div className="grid gap-3" onKeyDown={event=>event.stopPropagation()}>
                {[
                  {label:"Status",value:status,change:(v:string)=>setStatus(v as typeof status),choices:[["active","Active"],["archived","Archived"],["trashed","Trash"]]},
                  {label:"Type",value:kind,change:setKind,choices:[["chat","Chats"],["side_chat","Side chats"],["subagent","Tasks"]]},
                  {label:"Last activity",value:period,change:setPeriod,choices:[["all","Any time"],["week","Past week"],["month","Past month"]]},
                  {label:"Sort",value:sort,change:(v:string)=>setSort(v as typeof sort),choices:[["recent","Recent first"],["oldest","Oldest first"]]},
                  {label:"Group by",value:group,change:setGroup,choices:[["none","None"],["date","Month"],["project","Project"]]},
                ].map(filter=><label className="grid gap-1.5" key={filter.label}>
                  <span className="text-[12px] text-[#b7b8bd]">{filter.label}</span>
                  <select aria-label={filter.label} value={filter.value} onChange={event=>filter.change(event.target.value)}
                    className="w-full rounded-md border border-[#414246] bg-[#303134] px-2.5 py-2 text-[13px] text-[#f5f5f6] outline-none focus-visible:ring-2 focus-visible:ring-[#939398]">
                    {filter.choices.map(([id,name])=><option key={id} value={id}>{name}</option>)}
                  </select>
                </label>)}
              </div>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button type="button" aria-pressed={selectMode} onClick={()=>{setSelectMode(value=>!value);setSelected(new Set());}}
            className="rounded-md bg-foreground/10 px-3 py-[7px] text-[12px] font-medium text-foreground hover:bg-foreground/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{selectMode?"Cancel":"Select"}</button>
        </div>
      </header>
      {searchOpen?<label className="mb-4 flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3">
        <Search size={16} className="shrink-0 text-muted-foreground"/>
        <input autoFocus className="min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
          value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search conversations" aria-label="Search account conversations"/>
        {query?<button type="button" aria-label="Clear search" onClick={()=>setQuery("")}><X size={15}/></button>:null}
      </label>:null}
      {selectMode && selected.size>0?<div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-2.5 text-[13px]">
        <strong className="px-2">{selected.size} selected</strong>
        <button type="button" className="rounded-md px-2 py-1.5 hover:bg-muted" onClick={()=>void bulk(status==="archived"?"active":"archived")}>{status==="archived"?"Restore":"Archive"}</button>
        <button type="button" className="rounded-md px-2 py-1.5 text-destructive hover:bg-muted" onClick={()=>void bulk("trashed")}>Delete</button>
        <button type="button" className="ml-auto rounded-md px-2 py-1.5 hover:bg-muted" onClick={()=>setSelected(new Set())}>Clear</button>
      </div>:null}
      {failure?<div role="alert" className="mb-3 flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5 text-[13px]">
        <span>{failure}</span><button type="button" className="rounded-md border border-border px-3 py-1.5" onClick={()=>setRevision(x=>x+1)}>Retry</button>
      </div>:null}
      {!rows.length && !loading && !failure?<p className="py-16 text-center text-[14px] text-muted-foreground">
        {query?"No matching conversations.":"No conversations in this view."}
      </p>:null}
      <div className="as-chats__list">
        {grouped.map(([section,items])=><section key={section} aria-label={section} className={group==="none"?"":"mb-5"}>
          {group!=="none"?<h2 className="mb-2 border-b border-border/60 pb-2 text-[12px] font-medium text-muted-foreground">{section}</h2>:null}
          <div className="divide-y divide-foreground/[.065]">
            {items.map(chat=><article key={chat.id} className="group relative flex min-h-[47px] items-center gap-2 rounded-md px-3 transition-colors hover:bg-foreground/[.075] focus-within:bg-foreground/[.075]">
              {selectMode?<input type="checkbox" aria-label={"Select "+chat.title} checked={selected.has(chat.id)}
                onChange={e=>setSelected(current=>{const next=new Set(current);if(e.target.checked)next.add(chat.id);else next.delete(chat.id);return next;})}
                className="size-[15px] shrink-0 accent-current"/>:null}
              {editing===chat.id?<form className="flex min-w-0 flex-1 gap-2" onSubmit={e=>{e.preventDefault();saveName(chat);}}>
                <input autoFocus value={draftTitle} onChange={e=>setDraftTitle(e.target.value)} maxLength={160}
                  aria-label="Rename conversation" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[14px] text-foreground"/>
                <button type="submit" aria-label="Save name" className="rounded-md px-1 hover:bg-foreground/10"><Check size={16}/></button>
                <button type="button" aria-label="Cancel rename" className="rounded-md px-1 hover:bg-foreground/10" onClick={()=>setEditing(null)}><X size={16}/></button>
              </form>:<button type="button" className="min-w-0 flex-1 truncate py-3 text-left text-[14px] font-normal leading-[22px] tracking-[.002em] text-foreground/95" onClick={()=>open(chat.id)}
                title={chat.title}>{chat.title}</button>}
              <div className="relative flex h-10 w-[116px] shrink-0 items-center justify-end sm:w-[130px]">
                <time className={"block truncate text-right text-[12px] font-normal leading-[20px] text-foreground/55 transition-opacity duration-100 group-hover:opacity-0 group-focus-within:opacity-0 "+(openMenuId === chat.id ? "opacity-0" : "")}
                  dateTime={new Date(chat.updatedAt*1000).toISOString()}>{activityLabel(chat.updatedAt)}</time>
                <DropdownMenu.Root open={openMenuId === chat.id} onOpenChange={open=>setOpenMenuId(open ? chat.id : null)}>
                  <DropdownMenu.Trigger asChild><button type="button" aria-label={chat.title+" options"} title="More options"
                    className="absolute right-0 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-foreground/85 opacity-0 transition-opacity duration-100 hover:bg-foreground/15 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-[state=open]:opacity-100 max-sm:opacity-100"><MoreHorizontal size={18}/></button></DropdownMenu.Trigger>
                  <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} collisionPadding={12} className={menuPanel}>
                    <DropdownMenu.Item className={menuItem} onSelect={()=>{setSelectMode(true);setSelected(new Set([chat.id]));}}><CheckSquare size={15} className="text-[#bcbec3]"/><span className="flex-1">Select</span></DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={()=>void navigator.clipboard.writeText(chat.id).catch(()=>setFailure("Could not copy the conversation ID."))}><Copy size={15} className="text-[#bcbec3]"/><span className="flex-1">Copy session ID</span></DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1.5 h-px bg-white/10"/>
                    <DropdownMenu.Item className={menuItem} onSelect={()=>void change(chat,{pinned:!chat.pinned})}><Pin size={15} className="text-[#bcbec3]"/><span className="flex-1">{chat.pinned?"Unpin":"Pin"}</span></DropdownMenu.Item>
                    <DropdownMenu.Item className={menuItem} onSelect={()=>{setEditing(chat.id);setDraftTitle(chat.title);}}><Pencil size={15} className="text-[#bcbec3]"/><span className="flex-1">Rename</span></DropdownMenu.Item>
                    {projects.length>0?<DropdownMenu.Sub><DropdownMenu.SubTrigger className={menuItem}>
                      <FolderKanban size={15} className="text-[#bcbec3]"/><span className="flex-1">Add to project</span><ChevronRight size={15} className="text-[#bcbec3]"/>
                    </DropdownMenu.SubTrigger><DropdownMenu.Portal><DropdownMenu.SubContent alignOffset={-5} sideOffset={8} collisionPadding={12} className={menuPanel+" max-h-72 overflow-y-auto"}>
                      <DropdownMenu.Item className={menuItem} onSelect={()=>void change(chat,{projectId:null})}>Unassigned</DropdownMenu.Item>
                      {projects.map(project=><DropdownMenu.Item key={project.id} className={menuItem} onSelect={()=>void change(chat,{projectId:project.id})}>{project.name}</DropdownMenu.Item>)}
                    </DropdownMenu.SubContent></DropdownMenu.Portal></DropdownMenu.Sub>:null}
                    <DropdownMenu.Separator className="my-1.5 h-px bg-white/10"/>
                    {chat.state!=="archived"?<DropdownMenu.Item className={menuItem} disabled={chat.local} onSelect={()=>void change(chat,{state:"archived"})}><Archive size={15} className="text-[#bcbec3]"/><span className="flex-1">Archive</span></DropdownMenu.Item>:
                      <DropdownMenu.Item className={menuItem} onSelect={()=>void change(chat,{state:"active"})}><RotateCcw size={15} className="text-[#bcbec3]"/><span className="flex-1">Restore</span></DropdownMenu.Item>}
                    {chat.state!=="trashed"?<DropdownMenu.Item className={menuItem+" text-[#fa858a]"} onSelect={()=>void remove(chat)}><Trash2 size={15}/><span className="flex-1">Delete</span></DropdownMenu.Item>:
                      <DropdownMenu.Item className={menuItem} onSelect={()=>void change(chat,{state:"active"})}><RotateCcw size={15}/><span className="flex-1">Restore from trash</span></DropdownMenu.Item>}
                  </DropdownMenu.Content></DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </article>)}
          </div>
        </section>)}
      </div>
      {loading?<p role="status" className="py-6 text-center text-[12px] text-muted-foreground">Loading conversations…</p>:null}
      <div ref={sentinel} className="h-1" aria-hidden="true"/>
      {hasMore && !loading?<button type="button" onClick={requestMore} className="mx-auto mt-4 block rounded-md border border-border px-4 py-2 text-[13px] hover:bg-muted">Load more conversations</button>:null}
    </div>
  </div>;
}
