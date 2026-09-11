import { Box, FileCode, Globe, Plus, Upload, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Composer } from "@/components/workbench/composer";
import { MessageList } from "@/components/workbench/thread";
import { BrowserStage } from "@/components/workbench/browser";
import { FilesStage } from "@/components/workbench/files";
import { ArtifactsStage } from "@/components/workbench/artifacts";
import { DeployStage } from "@/components/workbench/deploy";
import { cn } from "@/lib/utils";
import { useActiveSideTab, useWorkStore } from "@/lib/work/store";
import { StudioMark } from "@/components/mark";

function TabIcon({ kind }: { kind: string }) {
  if (kind === "chat") return <Users className="size-3.5" />;
  if (kind === "browser") return <Globe className="size-3.5" />;
  if (kind === "artifacts") return <Box className="size-3.5" />;
  if (kind === "deploy") return <Upload className="size-3.5" />;
  return <FileCode className="size-3.5" />;
}

export function SideStage() {
  const tabs = useWorkStore((s) => s.sideTabs);
  const activeId = useWorkStore((s) => s.activeSideTabId);
  const setActiveSideTab = useWorkStore((s) => s.setActiveSideTab);
  const closeSideTab = useWorkStore((s) => s.closeSideTab);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const setSideOpen = useWorkStore((s) => s.setSideOpen);
  const confirmId = useWorkStore((s) => s.confirmDiscardId);
  const setConfirmDiscard = useWorkStore((s) => s.setConfirmDiscard);
  const keepSideChat = useWorkStore((s) => s.keepSideChat);
  const tab = useActiveSideTab();

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 items-center gap-1 border-b border-border px-2">
        <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-full pl-2.5",
                item.id === activeId ? "bg-muted text-foreground" : "text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveSideTab(item.id)}
                className="flex items-center gap-1.5 py-1 text-xs"
              >
                <TabIcon kind={item.kind} />
                <span className="max-w-28 truncate">{item.title}</span>
              </button>
              <button
                type="button"
                aria-label={`Close ${item.title}`}
                className="rounded-full p-1.5 hover:bg-background hover:text-foreground"
                onClick={() => closeSideTab(item.id)}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Add side pane">
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => openSideTab("chat")}>
                <Users className="size-3.5" />
                Co-worker
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSideTab("browser", { ephemeral: false })}>
                <Globe className="size-3.5" />
                Browser
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSideTab("files", { ephemeral: false })}>
                <FileCode className="size-3.5" />
                Files
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSideTab("artifacts", { ephemeral: false })}>
                <Box className="size-3.5" />
                Artifacts
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openSideTab("deploy", { ephemeral: false })}>
                <Upload className="size-3.5" />
                Ship
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="ml-auto"
          aria-label="Close side stage"
          onClick={() => setSideOpen(false)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {tab?.kind === "chat" ? <CoworkerChat tabId={tab.id} /> : null}
        {tab?.kind === "browser" ? <BrowserStage tab={tab} /> : null}
        {tab?.kind === "files" ? <FilesStage tab={tab} /> : null}
        {tab?.kind === "artifacts" ? <ArtifactsStage /> : null}
        {tab?.kind === "deploy" ? <DeployStage /> : null}
        {!tab ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm text-muted-foreground">Open a co-worker, browser, or files pane.</p>
          </div>
        ) : null}
      </div>

      <Dialog open={Boolean(confirmId)} onOpenChange={(open) => !open && setConfirmDiscard(null)}>
        <DialogContent>
          <DialogTitle>Close this co-worker?</DialogTitle>
          <DialogDescription>
            Save their thread as its own lead chat, or discard the side conversation.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmDiscard(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (confirmId) keepSideChat(confirmId);
                setConfirmDiscard(null);
              }}
            >
              Save as chat
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirmId) closeSideTab(confirmId, true);
              }}
            >
              Discard
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CoworkerChat({ tabId }: { tabId: string }) {
  const tab = useWorkStore((s) => s.sideTabs.find((t) => t.id === tabId));
  const keepSideChat = useWorkStore((s) => s.keepSideChat);
  const trails = useWorkStore((s) => s.trails);
  const streaming = useWorkStore((s) => s.streamingIds.includes(tabId));
  if (!tab) return null;
  const parent = trails.find((t) => t.id === tab.parentTrailId);
  const empty = tab.messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {parent
            ? `Co-worker helping lead chat “${parent.title}” · reports back when done`
            : "Co-worker · reports into the lead chat"}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 rounded-full"
          onClick={() => keepSideChat(tab.id)}
          disabled={tab.messages.length === 0}
        >
          Save as chat
        </Button>
      </div>
      {parent ? (
        <div className="mx-3 mt-3 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Lead context: <span className="text-foreground">{parent.title}</span>
        </div>
      ) : null}
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <StudioMark className="mb-3 size-10" />
          <h2 className="text-base font-medium">Co-worker</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
            Spin up a specialist beside the lead agent — research, draft files, review — without derailing the main
            chat. Brief handoffs land back in the lead thread.
          </p>
        </div>
      ) : (
        <MessageList messages={tab.messages} trailId={parent?.id} streaming={streaming} />
      )}
      <Composer targetId={tab.id} targetKind="side" placeholder="Brief the co-worker" />
    </div>
  );
}
