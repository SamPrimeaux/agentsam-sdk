import { Fragment, useEffect, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowLeftRight, Columns2, Maximize2, Settings, Share, SquareTerminal, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChatThread } from "@/components/workbench/thread";
import { SideStage } from "@/components/workbench/side-stage";
import { ChatsPanel } from "@/components/shell/studio-panels";
import { SplitHandle } from "@/components/shell/split-handle";
import { calculateChatDockResize } from "@/components/shell/chat-dock";
import { ComputerFullscreen } from "@/components/workbench/computer-stage";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import type { Chat } from "@inneranimalmedia/agentsam-local-shared";

function restorePaneDock(key: string): "left" | "right" {
  if (typeof window === "undefined") return "left";
  try { return window.localStorage.getItem(key) === "right" ? "right" : "left"; }
  catch { return "left"; }
}

function restorePaneWidth(key: string, fallback: number, min: number, max: number) {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = Number(window.localStorage.getItem(key));
    return Number.isFinite(saved) && saved >= min && saved <= max ? saved : fallback;
  } catch { return fallback; }
}

export function ChatWorkspace({ chat }: { chat: Chat }) {
  const sideOpen = useWorkStore((s) => s.sideOpen);
  const sideTabs = useWorkStore((s) => s.sideTabs);
  const terminalOpen = useWorkStore((s) => s.terminalOpen);
  const setSideOpen = useWorkStore((s) => s.setSideOpen);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const renameChat = useWorkStore((s) => s.renameChat);
  const setActiveChat = useWorkStore((s) => s.setActiveChat);
  const toggleTerminal = useWorkStore((s) => s.toggleTerminal);
  const setSettingsOpen = useWorkStore((s) => s.setSettingsOpen);
  const [railW, setRailW] = useState(() => restorePaneWidth("agentsam.studio.railWidth", 288, 200, 420));
  const [sideW, setSideW] = useState(() => restorePaneWidth("agentsam.studio.sideWidth", 420, 280, 1100));
  const sideWRef = useRef(sideW);
  const dockChangedDuringDrag = useRef(false);
  const [chatDock, setChatDock] = useState<"left" | "right">(() => restorePaneDock("agentsam.studio.chatDock"));
  const [stageFull, setStageFull] = useState(false);

  useEffect(() => {
    setActiveChat(chat.id);
  }, [chat.id, setActiveChat]);
  useEffect(() => {
    try {
      window.localStorage.setItem("agentsam.studio.railWidth", String(railW));
      window.localStorage.setItem("agentsam.studio.sideWidth", String(sideW));
      window.localStorage.setItem("agentsam.studio.chatDock", chatDock);
    } catch { /* Preference persistence is optional; resizing must still work. */ }
  }, [railW, sideW, chatDock]);

  useEffect(() => { sideWRef.current = sideW; }, [sideW]);

  function lightPane(event: PointerEvent<HTMLElement>, on: boolean) {
    event.currentTarget.setAttribute("data-pane", on ? "hover" : "idle");
  }

  function toggleDual() {
    if (sideOpen) {
      setSideOpen(false);
      return;
    }
    if (sideTabs[0]) {
      setSideOpen(true);
      return;
    }
    openSideTab("chat");
  }

  async function share() {
    const markdown = [`# ${chat.title}`, "", ...chat.messages.map((m) => `**${m.role}**\n\n${m.content}`)].join(
      "\n\n",
    );
    try {
      await navigator.clipboard.writeText(markdown);
      toast("Chat copied");
    } catch {
      toast("Could not copy the chat");
    }
  }

  const chatPane = (
    <div key="agent-chat-pane" className="studio-pane flex min-h-0 min-w-0 flex-1 flex-col" onPointerEnter={(e) => lightPane(e, true)} onPointerLeave={(e) => lightPane(e, false)}>
      <ChatThread />
    </div>
  );
  const sidePane = sideOpen ? (
    <Fragment key="side-stage-pane">
      <button type="button" aria-label="Close side stage overlay" className="fixed inset-0 z-40 bg-ink/60 md:hidden" onClick={() => setSideOpen(false)}/>
      <aside
        className={cn("studio-pane min-h-0 min-w-0 bg-background", "max-md:fixed max-md:inset-0 max-md:z-50", "md:relative md:shrink-0 md:max-w-[calc(100%_-_clamp(360px,_36vw,_560px))] md:w-[var(--agentsam-side-stage-width)] md:basis-[var(--agentsam-side-stage-width)]")}
        style={{ "--agentsam-side-stage-width": sideW + "px" } as CSSProperties}
        onPointerEnter={(e) => lightPane(e, true)}
        onPointerLeave={(e) => lightPane(e, false)}
      >
        <SideStage onSplitChange={(enabled) => {
          if (enabled) {
            const minPrimaryWidth = Math.max(360, Math.min(560, window.innerWidth * 0.36));
            const next = Math.min(640, Math.max(280, window.innerWidth - railW - minPrimaryWidth));
            sideWRef.current = next;
            setSideW(next);
          }
        }}/>
      </aside>
    </Fragment>
  ) : null;
  const splitHandle = sideOpen ? (
    <SplitHandle
      key="chat-stage-split"
      axis="x"
      label="Resize side stage. Drag past the limit to move AgentSam chat to the other side"
      className="hidden md:flex"
      onDrag={(delta) => {
        const minPrimaryWidth = Math.max(360, Math.min(560, window.innerWidth * 0.36));
        const maxSideWidth = Math.max(280, Math.min(1100, window.innerWidth - railW - minPrimaryWidth));
        const next = calculateChatDockResize(chatDock, sideWRef.current, delta, maxSideWidth, dockChangedDuringDrag.current);
        if (next.docked) {
          dockChangedDuringDrag.current = true;
          setChatDock(next.dock);
        }
        sideWRef.current = next.width;
        setSideW(next.width);
      }}
      onDragEnd={() => { dockChangedDuringDrag.current = false; }}
      onDoubleClick={() => { sideWRef.current = 420; setSideW(420); }}
    />
  ) : null;
  const workspacePanes = !sideOpen ? [chatPane] : chatDock === "left" ? [chatPane, splitHandle, sidePane] : [sidePane, splitHandle, chatPane];

  return (
    <div className="studio-workspace flex h-full min-h-0">
      <aside
        className="studio-pane hidden h-full min-w-0 shrink-0 md:block"
        style={{ width: railW, flexBasis: railW }}
        onPointerEnter={(e) => lightPane(e, true)}
        onPointerLeave={(e) => lightPane(e, false)}
      >
        <ChatsPanel activeId={chat.id} showBrandFooter={false} />
      </aside>
      <SplitHandle
        axis="x"
        label="Resize chat list"
        className="hidden md:flex"
        onDrag={(d) => setRailW((w) => Math.min(420, Math.max(200, w + d)))}
        onDoubleClick={() => setRailW(288)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 items-center gap-1 border-b border-border px-2">
          <Button asChild size="icon" variant="ghost" className="size-11 text-foreground md:hidden md:size-8">
            <Link to="/admin/chats" aria-label="Back to chats">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <input
            value={chat.title}
            onChange={(e) => renameChat(chat.id, e.target.value)}
            className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium tracking-tight outline-none"
            aria-label="Chat title"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11 md:size-8"
                aria-label="Copy chat"
                onClick={() => void share()}
              >
                <Share className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy chat</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11 md:size-8"
                aria-label="Open co-worker"
                onClick={() => openSideTab("chat")}
              >
                <Users className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Co-worker</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={terminalOpen ? "secondary" : "ghost"}
                className="size-11 md:size-8"
                aria-label="Toggle CLI drawer"
                onClick={toggleTerminal}
              >
                <SquareTerminal className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>CLI drawer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={stageFull ? "secondary" : "ghost"}
                className="size-11 md:size-8"
                aria-label="Fullscreen computer use"
                onClick={() => setStageFull(true)}
              >
                <Maximize2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fullscreen + composer</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-11 md:size-8"
                aria-label="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant={sideOpen ? "secondary" : "ghost"}
                className="hidden size-8 md:inline-flex"
                aria-label="Toggle side stage"
                onClick={toggleDual}
              >
                <Columns2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Side stage</TooltipContent>
          </Tooltip>
          {sideOpen ? <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon" variant="ghost" className="hidden size-8 md:inline-flex" aria-label={chatDock === "left" ? "Move AgentSam chat to the right" : "Move AgentSam chat to the left"} onClick={() => setChatDock((dock) => dock === "left" ? "right" : "left")}>
                <ArrowLeftRight className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Swap chat and stage</TooltipContent>
          </Tooltip> : null}
        </header>

        <div className="studio-workspace flex min-h-0 min-w-0 flex-1">{workspacePanes}</div>
      </div>
      <ComputerFullscreen open={stageFull} onClose={() => setStageFull(false)} />
    </div>
  );
}
