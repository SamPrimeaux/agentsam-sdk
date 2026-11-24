import { useEffect, useState, type CSSProperties } from "react";
import { AgentConversationSurface } from "@inneranimalmedia/agentsam-workbench/agent";
import { Box, Database, ExternalLink, FileCode, Film, Globe, Layers, Columns2, Maximize2, Minimize2, MoreHorizontal, Plus, SquareTerminal, Target, Users, X, LayoutGrid, Search, FileText, ClipboardCheck, Code2, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SplitHandle } from "@/components/shell/split-handle";
import { IconAction } from "@/components/ui/icon-action";
import { AnnotationToggle } from "../../../agentsam/AnnotationHelper";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Composer } from "@/components/workbench/composer";
import { GoalGuruHost } from "@/components/goals/GoalGuruHost";
import { MessageList } from "@/components/workbench/thread";
import { BrowserStage } from "@/components/workbench/browser";
import { FilesStage } from "@/components/workbench/files";
import { ArtifactsStage } from "@/components/workbench/artifacts";
import { AppLibraryStage } from "@/components/workbench/app-library-stage";
import { NewTabStage } from "@/components/workbench/new-tab-stage";
import { ItemStage } from "@/components/workbench/item-stage";
import { StageIcon, TabItemIcon } from "@/components/workbench/stage-icons";
import { AppPreviewStage } from "@/components/workbench/app-preview-stage";
import { CanvasEntryStage } from "@/components/workbench/canvas-entry-stage";
import { PluginSideStage } from "@/components/workbench/plugin-side-stage";
import { MovieModeSurface } from "@/components/media/MovieModeSurface";
import { DatabaseStage } from "@/components/workbench/database-stage";
import { DataArtifactStage } from "@/components/workbench/data-artifact-stage";
import { TerminalPane } from "@/components/workbench/terminal";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import { getTauriInvoke } from "@/lib/desktop/tauri";
import { StudioMark } from "@/components/mark";
import { consumePendingDatabaseAssistantContext } from "@/lib/database/assistantContext";
import { consumePendingCadAssistantContext } from "@/lib/cad/assistantContext";
import { reloadSideStageRegistry, useSideStageRegistry } from "../../../agentsam/side-stage-actions";

function TabIcon({ kind, icon }: { kind: string; icon?: string | null }) {
  if (icon) return <TabItemIcon icon={icon} className="size-3.5 rounded-sm object-contain" />;
  if (kind === "chat") return <Users className="size-3.5" />;
  if (kind === "browser") return <Globe className="size-3.5" />;
  if (kind === "artifacts") return <Box className="size-3.5" />;
  if (kind === "app") return <Layers className="size-3.5" />;
  if (kind === "media") return <Film className="size-3.5" />;
  if (kind === "goal") return <Target className="size-3.5" />;
  if (kind === "database" || kind === "data") return <Database className="size-3.5" />;
  if (kind === "apps") return <LayoutGrid className="size-3.5" />;
  if (kind === "newtab") return <LayoutGrid className="size-3.5" />;
  if (kind === "terminal") return <SquareTerminal className="size-3.5" />;
  return <FileCode className="size-3.5" />;
}

export function SideStage({ workFocused = false, onFocusToggle, onSplitChange }: {
  workFocused?: boolean; onFocusToggle?: () => void; onSplitChange?: (enabled: boolean) => void;
}) {
  const tabs = useWorkStore((s) => s.sideTabs);
  const [splitCoworkerId, setSplitCoworkerId] = useState<string | null>(null);
  const [coworkerWidth, setCoworkerWidth] = useState(330);
  const activeId = useWorkStore((s) => s.activeSideTabId);
  const setActiveSideTab = useWorkStore((s) => s.setActiveSideTab);
  const closeSideTab = useWorkStore((s) => s.closeSideTab);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const convertSideTab = useWorkStore((s) => s.convertSideTab);
  const setSideOpen = useWorkStore((s) => s.setSideOpen);
  const confirmId = useWorkStore((s) => s.confirmDiscardId);
  const setConfirmDiscard = useWorkStore((s) => s.setConfirmDiscard);
  const keepSideChat = useWorkStore((s) => s.keepSideChat);
  const registry = useSideStageRegistry();
  const stages = registry.actions;
  const registered = (item: (typeof tabs)[number]) => item.kind !== 'plugin'
    || stages.some(stage => stage.pluginId === item.pluginId && stage.stageId === item.stageId);
  const removeTab = (item: (typeof tabs)[number]) => {
    if (item.kind === 'browser') {
      const invoke = getTauriInvoke();
      if (invoke) void invoke('embedded_browser_close', { sessionId: item.id }).catch(() => undefined);
    }
    closeSideTab(item.id);
  };
  // Account disabling and plugin uninstalling remove the visual entry, but
  // preserve cached tab state, draft text and conversations for re-enabling.
  const visibleTabs = registry.loaded && !registry.error ? tabs.filter(registered) : tabs;
  const tab = visibleTabs.find(item => item.id === activeId) ?? visibleTabs[0] ?? null;
  const splitCoworker = splitCoworkerId ? visibleTabs.find(item => item.id === splitCoworkerId && item.kind === 'chat') : null;
  const toggleCoworkerSplit = () => {
    if (splitCoworker) {
      setSplitCoworkerId(null);
      onSplitChange?.(false);
      return;
    }
    const existing = visibleTabs.find(item => item.kind === 'chat');
    const id = existing?.id || openSideTab('chat', { ephemeral: false });
    setSplitCoworkerId(id);
    // Opening a new co-worker normally selects its tab; leave Files mounted instead.
    if (tab) setActiveSideTab(tab.id);
    onSplitChange?.(true);
  };

  // Persisted plugin tabs can outlive a registry migration. When an installed
  // app becomes a host-owned renderer, upgrade its old tab in place instead
  // of leaving the obsolete plugin workspace mounted forever.
  useEffect(() => {
    if (!registry.loaded || registry.error) return;
    for (const item of tabs) {
      if (item.kind !== "plugin") continue;
      const stage = stages.find(candidate =>
        candidate.pluginId === item.pluginId && candidate.stageId === item.stageId);
      if (stage?.renderer !== "builtin" || !stage.tabKind) continue;
      const kind = stage.tabKind as Parameters<typeof convertSideTab>[1];
      const liveTabs = useWorkStore.getState().sideTabs;
      const nativeAlreadyOpen = liveTabs.some(candidate =>
        candidate.id !== item.id && candidate.kind === kind);
      convertSideTab(item.id, kind, nativeAlreadyOpen ? undefined : {
        title: stage.label,
        icon: stage.icon,
        pluginId: undefined,
        stageId: undefined,
        url: kind === "design" ? "/canvas?library=sources" : "",
        ephemeral: false,
      });
    }
  }, [registry.loaded, registry.error, stages, tabs, convertSideTab]);

  useEffect(() => {
    if (!registry.loaded || registry.error || !visibleTabs.length) return;
    if (!visibleTabs.some(item => item.id === activeId))
      setActiveSideTab(visibleTabs[0].id);
  }, [registry.loaded, registry.error, visibleTabs, activeId, setActiveSideTab]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 items-center gap-1 border-b border-border px-2">
        <div className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {visibleTabs.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex h-8 shrink-0 items-center rounded-[7px] border pl-2.5 backdrop-blur-md transition-colors",
                item.id === activeId
                  ? "border-border bg-muted/80 text-foreground shadow-sm"
                  : "border-transparent bg-background/30 text-muted-foreground hover:border-border/60 hover:bg-muted/40",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveSideTab(item.id)}
                className="flex items-center gap-1.5 py-1 text-xs"
              >
                <TabIcon kind={item.kind} icon={item.icon} />
                <span className="max-w-28 truncate" title={item.title}>{item.title}</span>
              </button>
              {item.kind === 'browser' && item.id === activeId && <AnnotationToggle />}
              {(['design', 'data', 'files'] as string[]).includes(item.kind) && item.id === activeId && <AnnotationToggle />}
              <IconAction
                type="button"
                variant="ghost"
                label={`Close ${item.title}`}
                hint={`Close ${item.title} Side Stage tab`}
                className="rounded-md p-1.5 hover:bg-background hover:text-foreground"
                onClick={() => removeTab(item)}
              >
                <X className="size-3" />
              </IconAction>
            </div>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconAction type="button" variant="ghost" label="Add Side Stage tab" hint="Choose an available Side Stage tool">
                <Plus className="size-4" />
              </IconAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => { openSideTab("newtab", { ephemeral: false }); setSideOpen(true); }}>
                <Plus className="size-3.5" />New tab
              </DropdownMenuItem>
              <div className="border-t border-border px-3 pb-1 pt-2 text-[11px] text-muted-foreground">Built-in tools</div>
              {!registry.loaded && <div role="status" className="px-3 py-2 text-xs text-muted-foreground">Loading tools…</div>}
              {registry.loaded && !registry.error && stages.filter(stage => stage.renderer === 'builtin').map((stage) => (
                <DropdownMenuItem key={stage.id} onSelect={() => {
                  openSideTab(stage.tabKind as Parameters<typeof openSideTab>[0], { title: stage.label, ephemeral: false });
                  setSideOpen(true);
                }}>
                  <StageIcon stage={stage} className="size-3.5" />{stage.label}
                </DropdownMenuItem>
              ))}
              <div className="border-t border-border px-3 pb-1 pt-2 text-[11px] text-muted-foreground">Installed additions</div>
              {!registry.loaded && <div role="status" className="px-3 py-2 text-xs text-muted-foreground">Loading additions…</div>}
              {registry.error && <DropdownMenuItem onSelect={() => { void reloadSideStageRegistry(); }}>Additions unavailable · Retry</DropdownMenuItem>}
              {registry.loaded && !registry.error && !stages.some(stage => stage.renderer !== 'builtin') &&
                <div role="status" className="px-3 py-2 text-xs text-muted-foreground">No installed additions</div>}
              {stages.filter(stage => stage.renderer !== 'builtin').map((stage) => {
                const Icon = {
                  target: Target, users: Users, globe: Globe, "file-code": FileCode,
                  box: Box, layers: Layers, layout: Layers, film: Film,
                  database: Database, "square-terminal": SquareTerminal,
                }[stage.icon] || Layers;
                return (
                  <DropdownMenuItem key={stage.id} onSelect={() => {
                    openSideTab(stage.tabKind as Parameters<typeof openSideTab>[0], {
                      title: stage.label,
                      pluginId: stage.pluginId,
                      stageId: stage.stageId,
                      parentChatId: stage.tabKind === "goal"
                        ? useWorkStore.getState().activeChatId : null,
                      ephemeral: false,
                    });
                  }}>
                    {stage.iconUrl
                      ? <img className="size-3.5 object-contain" src={stage.iconUrl} alt="" />
                      : <Icon className="size-3.5" />}
                    {stage.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconAction type="button" variant="ghost" label="Manage Side Stage tabs" hint="Remove open tabs without uninstalling apps">
                <MoreHorizontal className="size-4" />
              </IconAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {visibleTabs.length ? visibleTabs.map(item => (
                <DropdownMenuItem key={item.id} onSelect={() => removeTab(item)}>
                  <X className="mr-2 size-3.5" />Remove {item.title}
                </DropdownMenuItem>
              )) : <div className="px-3 py-2 text-xs text-muted-foreground">No open tabs</div>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {tab?.kind === "files" && <IconAction
          type="button" variant="ghost"
          className="hidden xl:inline-flex"
          label={splitCoworker ? "Close co-worker split" : "Split Files beside a co-worker"}
          hint="Lead thread | Monaco / preview | independent co-worker thread"
          aria-pressed={Boolean(splitCoworker)}
          onClick={toggleCoworkerSplit}
        ><Columns2 className="size-4" /></IconAction>}
        {tab?.kind === "files" && splitCoworker && <>
          <select className="hidden max-w-36 rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground lg:block"
            aria-label="Co-worker thread displayed beside the editor" value={splitCoworker.id}
            onChange={event=>setSplitCoworkerId(event.target.value)}>
            {visibleTabs.filter(item=>item.kind==='chat').map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <IconAction type="button" variant="ghost" className="hidden xl:inline-flex" label="Add another co-worker thread"
            hint="Start a separate co-worker beside the editor without closing Files"
            onClick={()=>{const fileTabId=tab.id;const id=openSideTab('chat',{ephemeral:false});setSplitCoworkerId(id);setActiveSideTab(fileTabId);}}>
            <Users className="size-4"/>
          </IconAction>
        </>}
        {tab?.kind === "media" && <IconAction
          type="button"
          variant="ghost"
          label="Open Media workspace"
          hint="Open Media in its dedicated workspace"
          onClick={() => window.dispatchEvent(new CustomEvent("agentsam:navigate", { detail: { to: "/admin/media" } }))}
        ><ExternalLink className="size-4" /></IconAction>}
        {onFocusToggle && <IconAction
          type="button"
          variant="ghost"
          label={workFocused ? "Exit full view" : "Expand to full view"}
          hint={workFocused ? "Restore chat and workspace split" : "Expand workspace and float the chat"}
          onClick={onFocusToggle}
        >{workFocused ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</IconAction>}
        <IconAction
          type="button"
          variant="ghost"
          className="ml-auto"
          label="Close Side Stage"
          hint="Hide the Side Stage without closing its tabs"
          onClick={() => setSideOpen(false)}
        >
          <X className="size-4" />
        </IconAction>
      </div>

      <div className="min-h-0 flex-1" data-agentsam-annotation-scope="" data-side-stage-kind={tab?.kind || "newtab"}>
        {tab?.kind === "chat" ? <CoworkerChat tabId={tab.id} /> : null}
        {tab?.kind === "browser" ? <BrowserStage tab={tab} /> : null}
        {tab?.kind === "files" ? splitCoworker ? (
          <div className="flex h-full min-h-0 min-w-0">
            <div className="min-w-0 flex-1"><FilesStage tab={tab} /></div>
            <SplitHandle axis="x" className="hidden xl:flex" label="Resize editor and co-worker"
              onDrag={delta=>setCoworkerWidth(width=>Math.max(260,Math.min(520,width-delta)))}
              onDoubleClick={()=>setCoworkerWidth(330)} />
            <aside className="hidden min-h-0 shrink-0 border-l border-border bg-background xl:block xl:w-[var(--coworker-width)] xl:basis-[var(--coworker-width)]"
              style={{"--coworker-width":coworkerWidth+"px"} as CSSProperties} aria-label="Independent co-worker thread">
              <CoworkerChat tabId={splitCoworker.id}/>
            </aside>
          </div>
        ) : <FilesStage tab={tab} /> : null}
        {tab?.kind === "artifacts" ? <ArtifactsStage tab={tab} /> : null}
        {tab?.kind === "app" ? <AppPreviewStage tab={tab} /> : null}
        {tab?.kind === "design" ? <CanvasEntryStage tab={tab} /> : null}
        {tab?.kind === "plugin" ? <PluginSideStage stage={stages.find(stage => stage.pluginId === tab.pluginId && stage.stageId === tab.stageId)} /> : null}
        {tab?.kind === "media" ? <MovieModeSurface workPane /> : null}
        {tab?.kind === "database" ? <DatabaseStage /> : null}
        {tab?.kind === "data" ? <DataArtifactStage tab={tab} /> : null}
        {tab?.kind === "apps" ? <AppLibraryStage /> : null}
        {tab?.kind === "newtab" ? <NewTabStage tab={tab} /> : null}
        {tab?.kind === "item" ? <ItemStage tab={tab} /> : null}
        {tab?.kind === "terminal" ? <TerminalPane variant="side" /> : null}
        {tab?.kind === "goal" ? <GoalEditor chatId={tab.parentChatId ?? undefined} /> : null}
        {!tab ? <NewTabStage /> : null}
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

function formatDatabaseAssistantContext(ctx: Record<string, unknown>): string {
  const lines = [
    "Database assistant context (selected surface only — do not invent other tenants or dump the whole DB):",
    `Provider: ${ctx.provider ?? "unknown"}`,
    `Source: ${ctx.sourceLabel ?? ctx.sourceId ?? "unknown"}`,
    `Engine: ${ctx.engine ?? "unknown"}`,
    `Table: ${ctx.selectedTable ?? "(none selected)"}`,
    `View: ${ctx.view ?? "unknown"}`,
    `Writable: ${ctx.writable ? "yes" : "no"}`,
    `Range: ${ctx.range ?? "n/a"}`,
    `Current error: ${ctx.currentError || "none"}`,
  ];
  if (typeof ctx.sqlDraft === "string" && ctx.sqlDraft.trim()) {
    lines.push(`SQL draft:\n${String(ctx.sqlDraft).slice(0, 2000)}`);
  }
  lines.push(
    "",
    "Help with this database context: explain schema/errors, draft SQL, or propose safe mutations. Never execute writes yourself — only propose.",
  );
  return lines.join("\n");
}

const COWORKER_TASK_STARTERS = [
  {
    label: "Research",
    detail: "Evidence, sources and findings",
    prompt: "Research the assigned question for the lead. Return a concise evidence-backed brief with sources, key findings, uncertainties and recommended next steps.",
    icon: Search,
  },
  {
    label: "Draft",
    detail: "Create a usable deliverable",
    prompt: "Draft the requested deliverable for the lead. Keep it editable, save it through the existing project or artifact workflow, and report the exact output location.",
    icon: FileText,
  },
  {
    label: "Review",
    detail: "Check quality and gaps",
    prompt: "Review the current work for correctness, missing cases, usability and risks. Return prioritized findings with concrete evidence and file or line references.",
    icon: ClipboardCheck,
  },
  {
    label: "Build",
    detail: "Implement a scoped change",
    prompt: "Implement the assigned scoped change in the existing project. Reuse current contracts and systems, run focused checks, and report changed files and test results.",
    icon: Code2,
  },
] as const;

function CoworkerChat({ tabId }: { tabId: string }) {
  const tab = useWorkStore((s) => s.sideTabs.find((t) => t.id === tabId));
  const keepSideChat = useWorkStore((s) => s.keepSideChat);
  const setDraft = useWorkStore((s) => s.setDraft);
  const chats = useWorkStore((s) => s.chats);
  const streaming = useWorkStore((s) => s.streamingIds.includes(tabId));
  const [databaseContext, setDatabaseContext] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const apply = (detail: Record<string, unknown>) => {
      setDatabaseContext(detail);
      const existing = useWorkStore.getState().drafts[tabId] || "";
      if (!existing.trim()) {
        setDraft(tabId, formatDatabaseAssistantContext(detail));
      }
    };

    const pending = consumePendingDatabaseAssistantContext();
    if (pending) apply(pending);

    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail;
      if (!detail || typeof detail !== "object") return;
      apply(detail);
    };
    window.addEventListener("agentsam:database-assistant-context", onContext);
    // CAD Creator guest: prompt + structured selection arrive as conversation context/draft.
    const applyCad = (detail: any) => {
      if (!detail?.prompt) return;
      const sel = detail.selection?.object ? ` [CAD selection: ${detail.selection.object.label} ${detail.selection.object.id}, project ${detail.selection.project_id} rev ${detail.selection.revision}, units in]` : "";
      const existing = useWorkStore.getState().drafts[tabId] || "";
      if (!existing.trim()) setDraft(tabId, `${detail.prompt}${sel}`);
    };
    const pendingCad = consumePendingCadAssistantContext();
    if (pendingCad) applyCad(pendingCad);
    const onCad = (e: Event) => applyCad((e as CustomEvent).detail);
    window.addEventListener("agentsam:cad-assistant-context", onCad);
    return () => { window.removeEventListener("agentsam:database-assistant-context", onContext); window.removeEventListener("agentsam:cad-assistant-context", onCad); };
  }, [setDraft, tabId]);

  if (!tab) return null;
  const parent = chats.find((t) => t.id === tab.parentChatId);
  const empty = tab.messages.length === 0;
  const hasResponse = tab.messages.some(message => message.role === "assistant");
  const statusLabel = streaming ? "Working" : hasResponse && tab.reportToLead ? "Returned to lead" : empty ? "Reports back when done" : "Brief sent";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-xs text-muted-foreground">
            {parent
              ? `Co-worker helping lead chat “${parent.title}”`
              : "Co-worker · independent task"}
          </p>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" data-coworker-status={streaming ? "working" : hasResponse && tab.reportToLead ? "returned" : "ready"}>
            {streaming ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : hasResponse && tab.reportToLead ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-current opacity-60" />}
            {statusLabel}
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 shrink-0 rounded-full"
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
      {databaseContext ? (
        <div className="mx-3 mt-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Database:{" "}
          <span className="text-foreground">
            {String(databaseContext.sourceLabel || databaseContext.sourceId || "source")}
          </span>
          {databaseContext.selectedTable ? (
            <>
              {" · "}
              <span className="text-foreground">{String(databaseContext.selectedTable)}</span>
            </>
          ) : null}
          {databaseContext.currentError ? (
            <>
              {" · "}
              <span className="text-destructive">error present</span>
            </>
          ) : null}
        </div>
      ) : null}
      <AgentConversationSurface
        empty={empty}
        thread={<MessageList messages={tab.messages} chatId={parent?.id} streaming={streaming} />}
        emptyState={
          <div className="flex w-full flex-col items-center justify-center gap-5 px-5 py-6 text-center">
            <div className="flex flex-col items-center">
              <StudioMark className="mb-3 size-10" />
              <h2 className="text-base font-medium">
                {databaseContext ? "Database co-worker" : "Co-worker"}
              </h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
                {databaseContext
                  ? "Selected database context is loaded below. Brief AgentSam to explain schema, draft SQL, or reason about the current error — writes still require confirmation in the editor."
                  : "Give a specialist a focused assignment. It works beside the lead conversation and returns its completed brief there automatically."}
              </p>
            </div>
            {!databaseContext ? (
              <div className="w-full max-w-sm text-left">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Start with a focus</p>
                <div className="grid grid-cols-2 gap-2">
                  {COWORKER_TASK_STARTERS.map(starter => {
                    const Icon = starter.icon;
                    return (
                      <Button
                        key={starter.label}
                        type="button"
                        variant="outline"
                        className="h-auto min-h-[68px] flex-col items-start justify-center gap-1 rounded-xl px-3 py-2.5 text-left"
                        onClick={() => {
                          const current = useWorkStore.getState().drafts[tab.id] || "";
                          setDraft(tab.id, current.trim() ? `${current.trim()}

${starter.prompt}` : starter.prompt);
                        }}
                      >
                        <span className="inline-flex items-center gap-2 text-xs font-semibold"><Icon className="size-3.5" aria-hidden="true" />{starter.label}</span>
                        <span className="text-[10px] font-normal text-muted-foreground">{starter.detail}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <p className="max-w-sm text-[11px] text-muted-foreground">
              {databaseContext
                ? "Review proposed changes in the owning editor before applying them."
                : "You can edit the brief before sending. The lead chat remains undisturbed while the co-worker works."}
            </p>
          </div>
        }
        composer={
          <Composer
            targetId={tab.id}
            targetKind="side"
            placeholder={databaseContext ? "Ask about this database…" : "Brief the co-worker"}
          />
        }
        composerClassName="px-3 pb-3 pt-3"
      />
    </div>
  );
}


function GoalEditor({ chatId }: { chatId?: string }) {
  const activeChatId = useWorkStore((s) => s.activeChatId);
  const id = chatId ?? activeChatId;
  const goal = useWorkStore((s) => s.goals[id]);
  const clearGoal = useWorkStore((s) => s.clearGoal);

  // Retired the browser-storage-only editor. A legacy chat goal remains readable
  // until the user deliberately imports it into the account-owned goal domain.
  return <GoalGuruHost legacyGoal={goal ? {
    title: goal.title, preview: goal.preview,
  } : null} onLegacyImported={() => clearGoal(id)} />;
}
