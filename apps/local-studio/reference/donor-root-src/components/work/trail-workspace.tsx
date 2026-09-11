import { useCallback, useEffect, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Columns2, Image as ImageIcon, Share } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrailThread } from "@/components/work/chat-thread";
import { SideStage } from "@/components/work/side-stage";
import { SplitHandle } from "@/components/work/split-handle";
import { TrailsPanel } from "@/components/work/trails-panel";
import { useDesktop } from "@/hooks/use-desktop";
import { useWorkStore } from "@/lib/work/store";
import type { Trail } from "@/lib/work/types";

export function TrailWorkspace({ trail }: { trail: Trail }) {
  const desktop = useDesktop();
  const sideOpen = useWorkStore((s) => s.sideOpen);
  const sideTabs = useWorkStore((s) => s.sideTabs);
  const trailsOpen = useWorkStore((s) => s.trailsOpen);
  const trailsWidth = useWorkStore((s) => s.trailsWidth);
  const sideWidth = useWorkStore((s) => s.sideWidth);
  const setSideOpen = useWorkStore((s) => s.setSideOpen);
  const setTrailsOpen = useWorkStore((s) => s.setTrailsOpen);
  const setTrailsWidth = useWorkStore((s) => s.setTrailsWidth);
  const setSideWidth = useWorkStore((s) => s.setSideWidth);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const renameTrail = useWorkStore((s) => s.renameTrail);
  const setActiveTrail = useWorkStore((s) => s.setActiveTrail);

  useEffect(() => {
    setActiveTrail(trail.id);
  }, [trail.id, setActiveTrail]);

  const dragTrails = useCallback((delta: number) => {
    const store = useWorkStore.getState();
    const next = store.trailsWidth + delta;
    if (next < 80) store.setTrailsOpen(false);
    else store.setTrailsWidth(next);
  }, []);

  const dragSide = useCallback((delta: number) => {
    const store = useWorkStore.getState();
    store.setSideWidth(store.sideWidth - delta);
  }, []);

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
    openSideTab("browser");
  }

  async function share() {
    const markdown = [`# ${trail.title}`, "", ...trail.messages.map((m) => `**${m.role}**\n\n${m.content}`)].join(
      "\n\n",
    );
    try {
      await navigator.clipboard.writeText(markdown);
      toast("Chat copied");
    } catch {
      toast("Could not copy the chat");
    }
  }

  const header = (
    <header className="flex min-h-12 shrink-0 items-center gap-1 border-b border-border px-2">
      <Link
        to="/trails"
        aria-label="Back to chats"
        className="flex size-11 items-center justify-center rounded-md text-fg hover:bg-surface md:hidden"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <input
        value={trail.title}
        onChange={(e) => renameTrail(trail.id, e.target.value)}
        className="min-w-0 flex-1 bg-transparent px-2 text-sm font-medium tracking-tight outline-none"
        aria-label="Chat title"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" variant="ghost" aria-label="Copy chat" onClick={() => void share()}>
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
            aria-label="Open artifacts"
            onClick={() => openSideTab("artifacts")}
          >
            <ImageIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Artifacts</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant={sideOpen ? "secondary" : "ghost"}
            className="hidden md:inline-flex"
            aria-label="Toggle side stage"
            onClick={toggleDual}
          >
            <Columns2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Side stage</TooltipContent>
      </Tooltip>
    </header>
  );

  const sideOverlay =
    !desktop && sideOpen ? (
      <>
        <button
          type="button"
          aria-label="Close side stage overlay"
          className="fixed inset-0 z-40 bg-bg/60 md:hidden"
          onClick={() => setSideOpen(false)}
        />
        <aside className="studio-pane fixed inset-0 z-50 bg-bg md:hidden">
          <SideStage />
        </aside>
      </>
    ) : null;

  const stage = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {header}
      <div className="studio-workspace flex min-h-0 min-w-0 flex-1">
        <div
          className="studio-pane flex min-h-0 min-w-0 flex-1 flex-col"
          onPointerEnter={(e) => lightPane(e, true)}
          onPointerLeave={(e) => lightPane(e, false)}
        >
          <TrailThread />
        </div>
        {desktop && sideOpen ? (
          <>
            <SplitHandle
              axis="x"
              label="Resize side stage"
              onDrag={dragSide}
              onDoubleClick={() => setSideWidth(420)}
            />
            <aside
              className="studio-pane min-h-0 shrink-0"
              style={{ width: sideWidth, flexBasis: sideWidth }}
              onPointerEnter={(e) => lightPane(e, true)}
              onPointerLeave={(e) => lightPane(e, false)}
            >
              <SideStage />
            </aside>
          </>
        ) : null}
      </div>
      {sideOverlay}
    </div>
  );

  if (desktop && trailsOpen) {
    return (
      <div className="studio-workspace flex h-full min-h-0 w-full">
        <aside
          className="studio-pane min-h-0 shrink-0"
          style={{ width: trailsWidth, flexBasis: trailsWidth }}
          onPointerEnter={(e) => lightPane(e, true)}
          onPointerLeave={(e) => lightPane(e, false)}
        >
          <TrailsPanel activeId={trail.id} />
        </aside>
        <SplitHandle
          axis="x"
          label="Resize chat list"
          onDrag={dragTrails}
          onDoubleClick={() => setTrailsWidth(288)}
        />
        {stage}
      </div>
    );
  }

  return (
    <div className="studio-workspace flex h-full min-h-0">
      {desktop ? (
        <button
          type="button"
          aria-label="Peek chat list"
          className="rail-peek hidden w-3 shrink-0 md:block"
          onMouseEnter={() => setTrailsOpen(true)}
          onClick={() => setTrailsOpen(true)}
        />
      ) : null}
      {stage}
    </div>
  );
}
