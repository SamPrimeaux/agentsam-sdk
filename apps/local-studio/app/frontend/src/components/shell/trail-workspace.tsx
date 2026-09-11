import { useEffect, useState, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Columns2, Maximize2, Settings, Share, SquareTerminal, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrailThread } from "@/components/workbench/thread";
import { SideStage } from "@/components/workbench/side-stage";
import { TrailsPanel } from "@/components/shell/studio-panels";
import { SplitHandle } from "@/components/shell/split-handle";
import { ComputerFullscreen } from "@/components/workbench/computer-stage";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import type { Trail } from "@/lib/work/types";

export function TrailWorkspace({ trail }: { trail: Trail }) {
  const sideOpen = useWorkStore((s) => s.sideOpen);
  const sideTabs = useWorkStore((s) => s.sideTabs);
  const terminalOpen = useWorkStore((s) => s.terminalOpen);
  const setSideOpen = useWorkStore((s) => s.setSideOpen);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const renameTrail = useWorkStore((s) => s.renameTrail);
  const setActiveTrail = useWorkStore((s) => s.setActiveTrail);
  const toggleTerminal = useWorkStore((s) => s.toggleTerminal);
  const setSettingsOpen = useWorkStore((s) => s.setSettingsOpen);
  const [railW, setRailW] = useState(288);
  const [sideW, setSideW] = useState(420);
  const [stageFull, setStageFull] = useState(false);

  useEffect(() => {
    setActiveTrail(trail.id);
  }, [trail.id, setActiveTrail]);

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

  return (
    <div className="studio-workspace flex h-full min-h-0">
      <aside
        className="studio-pane hidden h-full min-w-0 shrink-0 md:block"
        style={{ width: railW, flexBasis: railW }}
        onPointerEnter={(e) => lightPane(e, true)}
        onPointerLeave={(e) => lightPane(e, false)}
      >
        <TrailsPanel activeId={trail.id} showBrandFooter={false} />
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
            <Link to="/trails" aria-label="Back to chats">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <input
            value={trail.title}
            onChange={(e) => renameTrail(trail.id, e.target.value)}
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
        </header>

        <div className="studio-workspace flex min-h-0 min-w-0 flex-1">
          <div
            className="studio-pane flex min-h-0 min-w-0 flex-1 flex-col"
            onPointerEnter={(e) => lightPane(e, true)}
            onPointerLeave={(e) => lightPane(e, false)}
          >
            <TrailThread />
          </div>
          {sideOpen ? (
            <>
              <button
                type="button"
                aria-label="Close side stage overlay"
                className="fixed inset-0 z-40 bg-ink/60 md:hidden"
                onClick={() => setSideOpen(false)}
              />
              <SplitHandle
                axis="x"
                label="Resize side stage"
                className="hidden md:flex"
                onDrag={(d) => setSideW((w) => Math.min(720, Math.max(280, w - d)))}
                onDoubleClick={() => setSideW(420)}
              />
              <aside
                className={cn(
                  "studio-pane min-h-0 min-w-0 bg-background",
                  "max-md:fixed max-md:inset-0 max-md:z-50",
                  "md:relative md:shrink-0",
                )}
                style={{ width: sideW, flexBasis: sideW }}
                onPointerEnter={(e) => lightPane(e, true)}
                onPointerLeave={(e) => lightPane(e, false)}
              >
                <SideStage />
              </aside>
            </>
          ) : null}
        </div>
      </div>
      <ComputerFullscreen open={stageFull} onClose={() => setStageFull(false)} />
    </div>
  );
}
