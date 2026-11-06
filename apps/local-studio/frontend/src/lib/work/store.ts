import { create } from "zustand";
import type { AgentRunMode } from "@inneranimalmedia/agentsam-contracts";
import type { ChatImageReference } from "@/lib/content/chat-images";
import { persist, createJSONStorage } from "zustand/middleware";
import { titleFromText, uid } from "@/lib/utils";
import { extractArtifacts, mergeArtifacts } from "@/lib/work/files";
import { DEFAULT_SELECTION, type StudioModelSelection } from "@/lib/work/models";
import { emptyDeploy, newEmptyProject, newFilesystemProject, newSampleProject } from "@/lib/work/seed";
import { emptyGit } from "@/lib/work/git";
import { pickRestoredProjectId } from "@/lib/work/workspace-restore";
import { streamChat } from "@/lib/work/stream";
import { selectStudioWorkspaceForTurn } from "@inneranimalmedia/agentsam-local-shared/studio-chat-policy";
import { localStudioRuntimeVisuals } from "@/lib/runtime-visuals/local-studio-runtime";
import type {
  Artifact,
  ChatMessage,
  NavView,
  OfflineQueuedSend,
  Project,
  SideKind,
  SideTab,
  Chat,
  WorkGoal,
} from "@inneranimalmedia/agentsam-local-shared";

const WELCOME_ID = "chat-studio";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome-msg",
  role: "assistant",
  content:
    "You are in AgentSam Work.\n\nConnect an authorized host workspace (agentsam start-local) to edit real project files in Monaco and run a real PTY. Sample tutorials are available only when you opt in.\n\nWhat are you working on?",
  createdAt: 1_746_000_000_000,
};

const STARTER_CHAT: Chat = {
  id: WELCOME_ID,
  title: "Studio",
  createdAt: 1_746_000_000_000,
  updatedAt: 1_746_000_000_000,
  pinned: false,
  messages: [WELCOME_MESSAGE],
  files: [],
  projectId: "",
};

export type WorkSurface = "chat" | "files" | "code" | "terminal" | "preview";

function normalizeProject(raw: Project): Project {
  return {
    id: raw.id,
    name: raw.name || "Untitled",
    description: raw.description || "",
    createdAt: raw.createdAt || Date.now(),
    updatedAt: raw.updatedAt || Date.now(),
    kind: raw.kind === "filesystem" ? "filesystem" : "scratch",
    workspaceRoot: raw.workspaceRoot ?? null,
    runtimeBaseUrl: raw.runtimeBaseUrl ?? null,
    workspaceId: raw.workspaceId ?? null,
    runtimeCapability: raw.runtimeCapability ?? null,
    files: (raw.files ?? []).map((f) => ({
      kind: "code" as const,
      origin: "editor" as const,
      ...f,
    })),
    dirs: raw.dirs ?? [],
    git: raw.git ?? emptyGit(),
    deploy: { ...emptyDeploy(), ...raw.deploy },
    cwd: raw.cwd || "/",
    pinned: raw.pinned,
  };
}

const aborts = new Map<string, AbortController>();

function newChat(partial?: Partial<Chat>): Chat {
  const now = Date.now();
  return {
    id: uid(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    pinned: false,
    messages: [],
    files: [],
    projectId: "",
    ...partial,
  };
}

const SIDE_TITLES: Record<SideKind, string> = {
  chat: "Co-worker",
  browser: "Browser",
  files: "Files",
  terminal: "CLI",
  artifacts: "Artifacts",
  deploy: "Ship",
  app: "CAD Creator",
  media: "MovieMode",
  goal: "Edit goal",
  database: "Database",
  design: "Canvas",
  plugin: "Plugin",
};

function newSideTab(kind: SideKind, extra?: Partial<SideTab>): SideTab {
  return {
    id: uid(),
    kind,
    title: SIDE_TITLES[kind],
    ephemeral: false,
    messages: [],
    parentChatId: null,
    keptChatId: null,
    url: "",
    srcdoc: null,
    fileId: null,
    history: [],
    historyIndex: -1,
    reportToLead: kind === "chat",
    ...extra,
  };
}

function excerptOf(chat: Chat | undefined) {
  if (!chat) return null;
  const slice = chat.messages.filter((m) => m.role !== "system").slice(-8);
  if (!slice.length) return null;
  return slice
    .map((m) => `${m.role === "user" ? "Lead user" : "Lead agent"}: ${m.content.slice(0, 800)}`)
    .join("\n\n");
}

function workspacePayload(project: Project | null | undefined) {
  if (!project) return [];
  return project.files
    .filter((f) => f.origin !== "deploy")
    .slice(0, 24)
    .map((f) => ({
      path: f.path,
      content: f.content.slice(0, 2500),
    }));
}

const RUN_MODES = new Set<AgentRunMode>(["ask", "plan", "agent", "debug", "multitask"]);

export function defaultRunModeForTarget(targetKind: "chat" | "side"): AgentRunMode {
  return targetKind === "side" ? "ask" : "agent";
}

function normalizedRunModes(value: unknown): Record<string, AgentRunMode> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, AgentRunMode] => typeof entry[1] === "string" && RUN_MODES.has(entry[1] as AgentRunMode),
    ),
  );
}

type FollowupQueuedSend = {
  id: string;
  targetId: string;
  targetKind: "chat" | "side";
  text: string;
  projectId: string;
  modelSelection: StudioModelSelection;
  runMode: AgentRunMode;
  createdAt: number;
};

type WorkState = {
  hydrated: boolean;
  projects: Project[];
  activeProjectId: string;
  chats: Chat[];
  activeChatId: string;
  drafts: Record<string, string>;
  sidebarOpen: boolean;
  mobileNavOpen: boolean;
  sideOpen: boolean;
  terminalOpen: boolean;
  /** CLI drawer height as a fraction of the viewport (0.22–0.88). */
  terminalHeight: number;
  settingsOpen: boolean;
  navView: NavView;
  modelSelection: StudioModelSelection;
  modelSelectionMode: "auto" | "manual";
  runModes: Record<string, AgentRunMode>;
  sideTabs: SideTab[];
  activeSideTabId: string | null;
  /** Mobile-first Work surface; desktop side tabs remain authoritative when sideOpen. */
  workSurface: WorkSurface;
  streamingIds: string[];
  search: string;
  confirmDiscardId: string | null;
  pendingCommands: string[];
  offlineQueue: OfflineQueuedSend[];
  followupQueue: FollowupQueuedSend[];
  pausedQueueTargets: string[];
  goals: Record<string, WorkGoal>;
  setWorkSurface: (surface: WorkSurface) => void;
  setGoal: (chatId: string, title: string, preview?: string) => void;
  updateGoal: (chatId: string, patch: Pick<WorkGoal, "title" | "preview">) => void;
  clearGoal: (chatId: string) => void;
  toggleGoalPaused: (chatId: string) => void;
  setHydrated: (value: boolean) => void;
  setSearch: (value: string) => void;
  setDraft: (id: string, value: string) => void;
  setNavView: (view: NavView) => void;
  setModelSelection: (selection: StudioModelSelection) => void;
  setModelSelectionMode: (mode: "auto" | "manual") => void;
  setRunMode: (targetId: string, mode: AgentRunMode) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setMobileNavOpen: (open: boolean) => void;
  setSideOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  setTerminalHeight: (height: number) => void;
  setSettingsOpen: (open: boolean) => void;
  toggleTerminal: () => void;
  reportCoworkerToLead: (sideTabId: string, summary: string) => void;
  setActiveChat: (id: string) => void;
  startChat: () => string;
  flushOfflineQueue: () => Promise<void>;
  renameChat: (id: string, title: string) => void;
  pinChat: (id: string) => void;
  deleteChat: (id: string) => void;
  setActiveProject: (id: string) => void;
  createSampleProject: (name?: string) => string;
  createEmptyProject: (name?: string) => string;
  moveChatToProject: (chatId: string, projectId: string) => void;
  /** Assign a Local Studio conversation to Work without moving its filesystem workspace. */
  assignChatToWorkProject: (chatId: string, workProjectId: string | null) => void;
  createProject: (name?: string) => string;
  createFilesystemProject: (opts: { root: string; name?: string; runtimeBaseUrl?: string }) => Promise<string>;
  createProjectForChat: (chatId: string, name?: string) => string;
  renameProject: (id: string, name: string) => void;
  pinProject: (id: string) => void;
  deleteProject: (id: string) => void;
  patchProject: (id: string, patch: Partial<Project> | ((p: Project) => Project)) => void;
  upsertFile: (projectId: string, file: Artifact) => void;
  deleteFile: (projectId: string, fileId: string) => void;
  selectFile: (fileId: string) => void;
  addReceipt: (file: Artifact) => void;
  openSideTab: (kind: SideKind, extra?: Partial<SideTab>) => string;
  closeSideTab: (id: string, force?: boolean) => void;
  setActiveSideTab: (id: string) => void;
  setTabUrl: (id: string, url: string) => void;
  navigateBrowser: (id: string, delta: number) => void;
  setBrowserSrcdoc: (id: string, srcdoc: string, title?: string) => void;
  setConfirmDiscard: (id: string | null) => void;
  keepSideChat: (id: string) => string | null;
  enqueueCommand: (cmd: string) => void;
  consumeCommands: () => string[];
  send: (
    targetId: string,
    targetKind: "chat" | "side",
    text?: string,
    context?: { projectId?: string; modelSelection?: StudioModelSelection; runMode?: AgentRunMode },
  ) => Promise<void>;
  stop: (id: string) => void;
  removeFollowup: (id: string) => void;
  updateFollowup: (id: string, text: string) => void;
  resumeFollowups: (targetId: string) => void;
};

function ensureShape(raw: Partial<WorkState> | undefined): Pick<
  WorkState,
  | "projects"
  | "activeProjectId"
  | "chats"
  | "activeChatId"
  | "drafts"
  | "sidebarOpen"
  | "sideOpen"
  | "terminalOpen"
  | "terminalHeight"
  | "navView"
  | "modelSelection"
  | "modelSelectionMode"
  | "runModes"
  | "sideTabs"
  | "activeSideTabId"
  | "workSurface"
  | "goals"
> {
  // Never invent a hardcoded Scratch project. Restore persisted workspaces only.
  const projects = (Array.isArray(raw?.projects) ? raw!.projects! : []).map(normalizeProject);
  const activeProjectId = pickRestoredProjectId(projects, raw?.activeProjectId);

  const chats = (raw?.chats?.length ? raw.chats : [STARTER_CHAT]).map((t) => ({
    ...STARTER_CHAT,
    ...t,
    files: t.files ?? [],
    projectId: t.projectId || activeProjectId,
  }));

  const project = projects.find((p) => p.id === activeProjectId);
  if (project) {
    const captured = chats.flatMap((t) => t.files);
    if (captured.length) {
      project.files = mergeArtifacts(project.files, captured);
    }
  }

  const workSurface: WorkSurface =
    raw?.workSurface === "files" ||
    raw?.workSurface === "code" ||
    raw?.workSurface === "terminal" ||
    raw?.workSurface === "preview" ||
    raw?.workSurface === "chat"
      ? raw.workSurface
      : "chat";

  return {
    projects,
    activeProjectId,
    chats,
    activeChatId: chats.some((t) => t.id === raw?.activeChatId) ? raw!.activeChatId! : chats[0]!.id,
    drafts: raw?.drafts ?? {},
    sidebarOpen: raw?.sidebarOpen ?? true,
    sideOpen: raw?.sideOpen ?? false,
    terminalOpen: raw?.terminalOpen ?? false,
    terminalHeight:
      typeof raw?.terminalHeight === "number"
        ? Math.min(0.88, Math.max(0.22, raw.terminalHeight))
        : 0.38,
    navView: raw?.navView ?? "chats",
    modelSelection:
      raw?.modelSelection && raw.modelSelection.provider && raw.modelSelection.model_id
        ? raw.modelSelection
        : { ...DEFAULT_SELECTION },
    modelSelectionMode: raw?.modelSelectionMode === "manual" ? "manual" : "auto",
    runModes: normalizedRunModes(raw?.runModes),
    sideTabs: (raw?.sideTabs ?? []).filter((t) => t.kind !== "deploy").map((t) => {
      const tab = t as SideTab;
      return {
        ...tab,
        ephemeral: tab.ephemeral ?? false,
        history: Array.isArray(tab.history) ? tab.history : [],
        historyIndex: typeof tab.historyIndex === "number" ? tab.historyIndex : -1,
        reportToLead:
          typeof tab.reportToLead === "boolean" ? tab.reportToLead : tab.kind === "chat",
      };
    }),
    activeSideTabId: raw?.activeSideTabId ?? null,
    workSurface,
    goals: raw?.goals && typeof raw.goals === "object" ? raw.goals : {},
  };
}

export const useWorkStore = create<WorkState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      ...ensureShape(undefined),
      mobileNavOpen: false,
      settingsOpen: false,
      streamingIds: [],
      search: "",
      confirmDiscardId: null,
      pendingCommands: [],
      offlineQueue: [],
      followupQueue: [],
      pausedQueueTargets: [],
      goals: {},
      setWorkSurface: (surface) => {
        const openSideTab = get().openSideTab;
        if (surface === "chat") {
          set({ workSurface: "chat", sideOpen: false });
          return;
        }
        if (surface === "files" || surface === "code") {
          openSideTab("files", { ephemeral: false });
          set({ workSurface: surface, sideOpen: true, terminalOpen: false });
          return;
        }
        if (surface === "terminal") {
          openSideTab("terminal", { ephemeral: false });
          set({ workSurface: "terminal", sideOpen: true });
          return;
        }
        openSideTab("browser", { ephemeral: false });
        set({ workSurface: "preview", sideOpen: true, terminalOpen: false });
      },
      setGoal: (chatId, title, preview = "") => {
        const now = Date.now();
        set((s) => ({
          goals: {
            ...s.goals,
            [chatId]: { id: "goal_" + uid(), chatId, title: title.slice(0, 12000), preview: preview.slice(0, 500), status: "active", startedAt: now, updatedAt: now },
          },
        }));
      },
      updateGoal: (chatId, patch) => set((s) => {
        const goal = s.goals[chatId];
        if (!goal) return s;
        return { goals: { ...s.goals, [chatId]: { ...goal, title: patch.title.slice(0, 12000), preview: patch.preview.slice(0, 500), updatedAt: Date.now() } } };
      }),
      clearGoal: (chatId) => set((s) => {
        const goals = { ...s.goals };
        delete goals[chatId];
        return { goals };
      }),
      toggleGoalPaused: (chatId) => {
        const goal = get().goals[chatId];
        if (!goal) return;
        if (goal.status === "active" && get().streamingIds.includes(chatId)) {
          aborts.get(chatId)?.abort();
          aborts.delete(chatId);
        }
        set((s) => ({
          goals: { ...s.goals, [chatId]: { ...goal, status: goal.status === "active" ? "paused" : "active", updatedAt: Date.now() } },
          streamingIds: goal.status === "active" ? s.streamingIds.filter((id) => id !== chatId) : s.streamingIds,
        }));
      },
      terminalHeight: 0.38,
      setHydrated: (value) => set({ hydrated: value }),
      setSearch: (search) => set({ search }),
      setDraft: (id, value) => set((s) => ({ drafts: { ...s.drafts, [id]: value } })),
      setNavView: (navView) => set({ navView, sidebarOpen: true }),
      setModelSelection: (modelSelection) => set({ modelSelection }),
      setModelSelectionMode: (modelSelectionMode) => set({ modelSelectionMode }),
      setRunMode: (targetId, mode) => set((state) => ({ runModes: { ...state.runModes, [targetId]: mode } })),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      setSideOpen: (sideOpen) => set({ sideOpen }),
      setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
      setTerminalHeight: (terminalHeight) =>
        set({ terminalHeight: Math.min(0.88, Math.max(0.22, terminalHeight)) }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      toggleTerminal: () => set((s) => ({ terminalOpen: !s.terminalOpen })),
      reportCoworkerToLead: (sideTabId, summary) => {
        const tab = get().sideTabs.find((t) => t.id === sideTabId);
        const leadId = tab?.parentChatId ?? get().activeChatId;
        if (!leadId || !summary.trim()) return;
        const note: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: `**Co-worker · ${tab?.title ?? "side"}**\n\n${summary.trim().slice(0, 4000)}`,
          createdAt: Date.now(),
        };
        set((s) => ({
          chats: s.chats.map((t) =>
            t.id === leadId
              ? { ...t, updatedAt: Date.now(), messages: [...t.messages, note] }
              : t,
          ),
        }));
      },
      setActiveChat: (id) => set({ activeChatId: id, navView: "chats" }),
      startChat: () => {
        const current = get().chats.find((t) => t.id === get().activeChatId);
        if (current && current.messages.length === 0 && (current.title === "New chat" || current.title === "New chat")) {
          return current.id;
        }
        const chat = newChat({ projectId: get().activeProjectId });
        set((s) => ({
          chats: [chat, ...s.chats],
          activeChatId: chat.id,
          navView: "chats",
        }));
        return chat.id;
      },
      flushOfflineQueue: async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) return;
        const queue = [...get().offlineQueue];
        if (!queue.length) return;
        set({ offlineQueue: [] });

        for (const item of queue) {
          const assistantId = uid();
          const replaceNote = (messages: ChatMessage[]) => {
            const without = messages.filter((m) => m.id !== item.noteId);
            return [
              ...without,
              { id: assistantId, role: "assistant" as const, content: "", createdAt: Date.now() },
            ];
          };

          if (item.targetKind === "chat") {
            set((s) => ({
              chats: s.chats.map((t) =>
                t.id === item.targetId
                  ? { ...t, updatedAt: Date.now(), messages: replaceNote(t.messages) }
                  : t,
              ),
              streamingIds: s.streamingIds.includes(item.targetId)
                ? s.streamingIds
                : [...s.streamingIds, item.targetId],
            }));
          } else {
            set((s) => ({
              sideTabs: s.sideTabs.map((t) =>
                t.id === item.targetId ? { ...t, messages: replaceNote(t.messages) } : t,
              ),
              streamingIds: s.streamingIds.includes(item.targetId)
                ? s.streamingIds
                : [...s.streamingIds, item.targetId],
            }));
          }

          const controller = new AbortController();
          aborts.set(item.targetId, controller);
          const after = get();
          let history: ChatMessage[] = [];
          let parentTitle: string | null = null;
          let parentExcerpt: string | null = null;
          if (item.targetKind === "chat") {
            history = after.chats.find((t) => t.id === item.targetId)?.messages ?? [];
          } else {
            const tab = after.sideTabs.find((t) => t.id === item.targetId);
            history = tab?.messages ?? [];
            const parent = after.chats.find((t) => t.id === tab?.parentChatId);
            parentTitle = parent?.title ?? null;
            parentExcerpt = excerptOf(parent);
          }

          const payload = history
            .filter((m) => m.id !== assistantId && (
            m.content.trim() || (Array.isArray(m.metadata?.attachments) && m.metadata.attachments.length > 0)
          ))
            .slice(-16)
            .map((m) => ({
            role: m.role, content: m.content,
            attachments: Array.isArray(m.metadata?.attachments)
              ? m.metadata.attachments as ChatImageReference[] : [],
          }));

          const project = after.projects.find((p) => p.id === after.activeProjectId) ?? after.projects[0] ?? null;

          const write = (content: string, done = false) => {
            if (item.targetKind === "chat") {
              set((s) => ({
                chats: s.chats.map((t) =>
                  t.id === item.targetId
                    ? {
                        ...t,
                        updatedAt: Date.now(),
                        messages: t.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)),
                        files: done ? mergeArtifacts(t.files, extractArtifacts(content, t.id)) : t.files,
                      }
                    : t,
                ),
              }));
            } else {
              set((s) => ({
                sideTabs: s.sideTabs.map((t) =>
                  t.id === item.targetId
                    ? {
                        ...t,
                        messages: t.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)),
                      }
                    : t,
                ),
              }));
            }
            if (done) {
              const captured = extractArtifacts(content, item.targetId);
              if (captured.length) {
                const parentId = get().activeProjectId;
                set((s) => ({
                  projects: s.projects.map((p) =>
                    p.id === parentId
                      ? { ...p, files: mergeArtifacts(p.files, captured), updatedAt: Date.now() }
                      : p,
                  ),
                }));
              }
            }
          };

          const visualOperationId = "agent-turn:" + assistantId;
          const queuedTaskSummary = item.text.replace(/\s+/g, " ").trim().slice(0, 180);
          const queuedCoworker = item.targetKind === "side";
          localStudioRuntimeVisuals.startAgentTurn(
            visualOperationId,
            queuedCoworker ? "Resuming co-worker task" : "Resuming queued work",
            queuedTaskSummary || undefined,
            item.targetId,
          );
          localStudioRuntimeVisuals.progressPoints(
            visualOperationId,
            "thinking",
            queuedCoworker ? "Resuming co-worker task" : "Resuming queued work",
            1,
            4,
            queuedTaskSummary || undefined,
            "phase-points",
            item.targetId,
          );
          try {
            let assembled = "";
            let sawDelta = false;
            await streamChat({
              messages: payload,
              surface: item.targetKind,
              runMode: item.runMode ?? after.runModes[item.targetId] ?? defaultRunModeForTarget(item.targetKind),
              provider: after.modelSelection?.provider,
              model_id: after.modelSelection?.model_id,
              parentTitle,
              parentExcerpt,
              workspace: workspacePayload(project),
              signal: controller.signal,
              operationId: visualOperationId,
              onActivity: (event) => localStudioRuntimeVisuals.reportRuntimeEvent(event, item.targetId),
              onDelta: (chunk) => {
                if (!sawDelta) {
                  sawDelta = true;
                  localStudioRuntimeVisuals.markAgentTurnStreaming(
                    visualOperationId,
                    queuedCoworker ? "Co-worker drafting response" : "Writing response",
                    queuedTaskSummary || undefined,
                    item.targetId,
                  );
                  localStudioRuntimeVisuals.progressPoints(
                    visualOperationId,
                    "thinking",
                    queuedCoworker ? "Co-worker drafting response" : "Writing response",
                    2,
                    4,
                    queuedTaskSummary || undefined,
                    "phase-points",
                    item.targetId,
                  );
                }
                assembled += chunk;
                write(assembled, false);
              },
            });
            write(assembled, true);
            localStudioRuntimeVisuals.progressPoints(
              visualOperationId,
              "verification",
              queuedCoworker ? "Preparing co-worker handoff" : "Finalizing response",
              3,
              4,
              queuedCoworker ? parentTitle || project.name : queuedTaskSummary || undefined,
              "phase-points",
              item.targetId,
            );
            if (queuedCoworker) {
              const tab = get().sideTabs.find((t) => t.id === item.targetId);
              if (tab?.reportToLead && assembled.trim()) {
                const brief =
                  assembled.trim().length > 1200
                    ? `${assembled.trim().slice(0, 1200).trim()}…`
                    : assembled.trim();
                get().reportCoworkerToLead(item.targetId, brief);
              }
            }
            localStudioRuntimeVisuals.progressPoints(
              visualOperationId,
              "verification",
              queuedCoworker ? "Co-worker handoff ready" : "Response ready",
              4,
              4,
              queuedCoworker ? parentTitle || project.name : undefined,
              "phase-points",
              item.targetId,
            );
            localStudioRuntimeVisuals.completeAgentTurn(visualOperationId, item.targetId);
          } catch (err) {
            if ((err as Error).name === "AbortError") {
              localStudioRuntimeVisuals.completeAgentTurn(visualOperationId, item.targetId);
              continue;
            }
            const message = err instanceof Error ? err.message : "The studio model could not reply.";
            localStudioRuntimeVisuals.failAgentTurn(visualOperationId, message, item.targetId);
            write(message, true);
          } finally {
            aborts.delete(item.targetId);
            set((s) => ({ streamingIds: s.streamingIds.filter((x) => x !== item.targetId) }));
          }
        }
      },
      renameChat: (id, title) =>
        set((s) => ({
          chats: s.chats.map((t) =>
            t.id === id ? { ...t, title: title.trim() || t.title, updatedAt: Date.now() } : t,
          ),
        })),
      pinChat: (id) =>
        set((s) => ({
          chats: s.chats.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
        })),
      deleteChat: (id) => {
        get().stop(id);
        localStudioRuntimeVisuals.releaseSurface(id);
        set((s) => {
          const chats = s.chats.filter((t) => t.id !== id);
          const fallback = chats[0] ?? newChat({ projectId: s.activeProjectId });
          const nextTrails = chats.length ? chats : [fallback];
          return {
            chats: nextTrails,
            activeChatId: s.activeChatId === id ? nextTrails[0]!.id : s.activeChatId,
          };
        });
      },
      setActiveProject: (id) => {
        const project = get().projects.find((p) => p.id === id);
        if (!project) return;
        const chat = get().chats.find((t) => t.projectId === id) ?? get().chats[0];
        set({
          activeProjectId: id,
          activeChatId: chat?.id ?? get().activeChatId,
          navView: "chats",
        });
      },
      moveChatToProject: (chatId, projectId) => {
        if (!get().projects.some((project) => project.id === projectId)) return;
        set((s) => ({
          activeProjectId: projectId,
          activeChatId: chatId,
          chats: s.chats.map((chat) =>
            chat.id === chatId ? { ...chat, projectId, updatedAt: Date.now() } : chat,
          ),
        }));
      },
      assignChatToWorkProject: (chatId, workProjectId) => {
        const id = workProjectId?.trim() || undefined;
        if (!get().chats.some((chat) => chat.id === chatId)) return;
        set((s) => ({
          chats: s.chats.map((chat) => chat.id === chatId
            ? { ...chat, workProjectId: id, updatedAt: Date.now() }
            : chat),
        }));
      },
      createProject: (name) => get().createEmptyProject(name),
      createEmptyProject: (name) => {
        const project = newEmptyProject(name?.trim() || "Untitled");
        const chat = newChat({ projectId: project.id, title: project.name, pinned: false });
        set((s) => ({
          projects: [project, ...s.projects],
          chats: [chat, ...s.chats],
          activeProjectId: project.id,
          activeChatId: chat.id,
          navView: "chats",
        }));
        return project.id;
      },
      createSampleProject: (name) => {
        const project = newSampleProject(name?.trim() || "Sample tutorial");
        const chat = newChat({ projectId: project.id, title: project.name, pinned: false });
        set((s) => ({
          projects: [project, ...s.projects],
          chats: [chat, ...s.chats],
          activeProjectId: project.id,
          activeChatId: chat.id,
          navView: "chats",
          workSurface: "files",
          sideOpen: true,
        }));
        get().openSideTab("files", { ephemeral: false });
        return project.id;
      },
      createFilesystemProject: async ({ root, name, runtimeBaseUrl }) => {
        const { probeLocalRuntime } = await import("@/lib/work/workspace-fs");
        const base = (runtimeBaseUrl || "http://127.0.0.1:3099").replace(/\/$/, "");
        const probe = await probeLocalRuntime(base);
        if (!probe.ok) {
          throw new Error(
            `Local filesystem runtime unavailable (${probe.error}). Run: agentsam start-local`,
          );
        }
        const authorizedRoot = probe.cwd;
        if (!authorizedRoot) {
          throw new Error("filesystem runtime did not report an authorized root");
        }
        const requested = root.trim();
        if (requested) {
          const norm = (p: string) => p.replace(/\\/g, "/").replace(/\/$/, "");
          if (norm(requested) !== norm(authorizedRoot)) {
            throw new Error(
              `Workspace root mismatch. Runtime is bound to ${authorizedRoot}. ` +
                `Start \`agentsam start-local\` from that directory (cannot claim arbitrary path ${requested}).`,
            );
          }
        }
        if (!probe.capability) {
          throw new Error("filesystem runtime did not mint a workspace capability");
        }
        // Two tabs attached to one physical root cannot be independent work lanes.
        // Reuse its existing project instead; distinct agents need distinct worktrees.
        const attached = get().projects.find(p =>
          p.kind === "filesystem" && p.workspaceRoot === authorizedRoot);
        if (attached) {
          if (attached.runtimeBaseUrl !== probe.baseUrl) {
            throw new Error(
              "This filesystem root is attached to another lane. " +
              "Start the new runtime from a separate Git worktree to avoid overlapping writes."
            );
          }
          set({ activeProjectId: attached.id });
          return attached.id;
        }
        const project = newFilesystemProject({
          name,
          root: authorizedRoot,
          runtimeBaseUrl: probe.baseUrl,
          workspaceId: probe.workspace_id,
          runtimeCapability: probe.capability,
        });
        if (!project.workspaceRoot) {
          throw new Error("filesystem workspace requires an absolute root path");
        }
        const chat = newChat({ projectId: project.id, title: project.name, pinned: false });
        set((s) => ({
          projects: [project, ...s.projects],
          chats: [chat, ...s.chats],
          activeProjectId: project.id,
          activeChatId: chat.id,
          navView: "chats",
          workSurface: "files",
          sideOpen: true,
        }));
        get().openSideTab("files", { ephemeral: false });
        return project.id;
      },
      createProjectForChat: (chatId, name) => {
        const project = newEmptyProject(name?.trim() || "Untitled");
        set((s) => ({
          projects: [project, ...s.projects],
          chats: s.chats.map((chat) =>
            chat.id === chatId ? { ...chat, projectId: project.id, updatedAt: Date.now() } : chat,
          ),
          activeProjectId: project.id,
          activeChatId: chatId,
          navView: "chats",
        }));
        return project.id;
      },
      renameProject: (id, name) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p,
          ),
        })),
      pinProject: (id) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, pinned: !p.pinned, updatedAt: Date.now() } : p,
          ),
        })),
      deleteProject: (id) =>
        set((s) => {
          const projects = s.projects.filter((p) => p.id !== id);
          const chats = s.chats.filter((t) => t.projectId !== id);
          const nextId = pickRestoredProjectId(projects, s.activeProjectId === id ? null : s.activeProjectId);
          const fallbackChat = chats.find((t) => t.projectId === nextId) ?? chats[0];
          return {
            projects,
            chats: chats.length ? chats : [newChat({ projectId: nextId })],
            activeProjectId: nextId,
            activeChatId:
              s.activeChatId && chats.some((t) => t.id === s.activeChatId)
                ? s.activeChatId
                : fallbackChat?.id ?? s.activeChatId,
          };
        }),
      patchProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => {
            if (p.id !== id) return p;
            const next = typeof patch === "function" ? patch(p) : { ...p, ...patch };
            return { ...next, updatedAt: Date.now() };
          }),
        })),
      upsertFile: (projectId, file) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, files: mergeArtifacts(p.files, [file]), updatedAt: Date.now() } : p,
          ),
        })),
      deleteFile: (projectId, fileId) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, files: p.files.filter((f) => f.id !== fileId) } : p,
          ),
          sideTabs: s.sideTabs.map((tab) => (tab.fileId === fileId ? { ...tab, fileId: null } : tab)),
        })),
      selectFile: (fileId) => {
        const { openSideTab, sideTabs, projects, activeProjectId } = get();
        const project = projects.find((p) => p.id === activeProjectId);
        const file = project?.files.find((f) => f.id === fileId);
        const existing = sideTabs.find((t) => t.kind === "files");
        if (existing) {
          set({
            sideOpen: true,
            activeSideTabId: existing.id,
            sideTabs: sideTabs.map((t) =>
              t.id === existing.id ? { ...t, fileId, title: file?.path ?? "Files" } : t,
            ),
          });
          return;
        }
        openSideTab("files", { fileId, ephemeral: false, title: file?.path ?? "Files" });
      },
      addReceipt: (file) => {
        const id = get().activeProjectId;
        get().upsertFile(id, file);
      },
      openSideTab: (kind, extra) => {
        const existing =
          kind === "files" ||
          kind === "artifacts" ||
          kind === "deploy" ||
          kind === "goal" ||
          kind === "terminal" ||
          kind === "database" ||
          kind === "design" ||
          kind === "plugin"
            ? get().sideTabs.find((t) => t.kind === kind &&
                (kind !== "plugin" || (t.pluginId === extra?.pluginId && t.stageId === extra?.stageId)))
            : undefined;
        if (existing) {
          set({
            sideOpen: true,
            activeSideTabId: existing.id,
            sideTabs: get().sideTabs.map((t) => (t.id === existing.id ? { ...t, ...extra } : t)),
          });
          return existing.id;
        }
        const tab = newSideTab(kind, {
          parentChatId: kind === "chat" ? get().activeChatId : extra?.parentChatId ?? null,
          ...extra,
        });
        if (kind === "chat" && tab.parentChatId) {
          const parent = get().chats.find((t) => t.id === tab.parentChatId);
          if (parent) tab.title = `Co-worker · ${parent.title}`;
        }
        set((s) => ({
          sideOpen: true,
          sideTabs: [...s.sideTabs, tab],
          activeSideTabId: tab.id,
        }));
        return tab.id;
      },
      closeSideTab: (id, force = false) => {
        const tab = get().sideTabs.find((t) => t.id === id);
        if (!tab) return;
        if (
          !force &&
          tab.kind === "chat" &&
          tab.ephemeral &&
          !tab.keptChatId &&
          tab.messages.length > 0
        ) {
          set({ confirmDiscardId: id });
          return;
        }
        set((s) => {
          const sideTabs = s.sideTabs.filter((t) => t.id !== id);
          return {
            sideTabs,
            activeSideTabId:
              s.activeSideTabId === id ? (sideTabs[sideTabs.length - 1]?.id ?? null) : s.activeSideTabId,
            sideOpen: sideTabs.length > 0,
            confirmDiscardId: s.confirmDiscardId === id ? null : s.confirmDiscardId,
          };
        });
        get().stop(id);
        localStudioRuntimeVisuals.releaseSurface(id);
      },
      setActiveSideTab: (id) => set({ activeSideTabId: id, sideOpen: true }),
      setTabUrl: (id, url) =>
        set((s) => ({
          sideTabs: s.sideTabs.map((t) => {
            if (t.id !== id) return t;
            const history = t.history.slice(0, Math.max(0, t.historyIndex) + 1);
            if (history[history.length - 1] !== url) history.push(url);
            return {
              ...t,
              url,
              srcdoc: null,
              title: hostname(url) || t.title,
              history,
              historyIndex: history.length - 1,
            };
          }),
        })),
      navigateBrowser: (id, delta) =>
        set((s) => ({
          sideTabs: s.sideTabs.map((t) => {
            if (t.id !== id) return t;
            const next = t.historyIndex + delta;
            if (next < 0 || next >= t.history.length) return t;
            const url = t.history[next]!;
            return {
              ...t,
              historyIndex: next,
              url,
              srcdoc: null,
              title: hostname(url) || t.title,
            };
          }),
        })),
      setBrowserSrcdoc: (id, srcdoc, title) =>
        set((s) => ({
          sideTabs: s.sideTabs.map((t) =>
            t.id === id
              ? { ...t, srcdoc, url: "", title: title ?? t.title }
              : t,
          ),
        })),
      setConfirmDiscard: (confirmDiscardId) => set({ confirmDiscardId }),
      keepSideChat: (id) => {
        const tab = get().sideTabs.find((t) => t.id === id);
        if (!tab || tab.kind !== "chat") return null;
        const files = extractArtifacts(tab.messages.map((m) => m.content).join("\n\n"));
        const chat = newChat({
          title: titleFromText(tab.messages.find((m) => m.role === "user")?.content ?? tab.title),
          messages: tab.messages,
          files,
          projectId: get().activeProjectId,
        });
        if (files.length) {
          get().patchProject(get().activeProjectId, (p) => ({
            ...p,
            files: mergeArtifacts(p.files, files),
          }));
        }
        set((s) => ({
          chats: [chat, ...s.chats],
          sideTabs: s.sideTabs.map((t) =>
            t.id === id ? { ...t, ephemeral: false, keptChatId: chat.id, title: chat.title } : t,
          ),
        }));
        return chat.id;
      },
      enqueueCommand: (cmd) =>
        set((s) => {
          const active = s.sideTabs.find((t) => t.id === s.activeSideTabId);
          const sideHasCli = s.sideOpen && active?.kind === "terminal";
          return {
            pendingCommands: [...s.pendingCommands, cmd],
            // Prefer an existing side CLI tab; otherwise open the bottom drawer.
            terminalOpen: sideHasCli ? s.terminalOpen : true,
          };
        }),
      consumeCommands: () => {
        const cmds = get().pendingCommands;
        if (cmds.length) set({ pendingCommands: [] });
        return cmds;
      },
      stop: (id) => {
        aborts.get(id)?.abort();
        aborts.delete(id);
        set((s) => ({
          streamingIds: s.streamingIds.filter((x) => x !== id),
          pausedQueueTargets: s.pausedQueueTargets.includes(id)
            ? s.pausedQueueTargets
            : [...s.pausedQueueTargets, id],
        }));
      },
      removeFollowup: (id) =>
        set((s) => ({ followupQueue: s.followupQueue.filter((item) => item.id !== id) })),
      updateFollowup: (id, text) =>
        set((s) => ({
          followupQueue: s.followupQueue.map((item) =>
            item.id === id ? { ...item, text: text.slice(0, 12000) } : item,
          ),
        })),
      resumeFollowups: (targetId) => {
        set((s) => ({ pausedQueueTargets: s.pausedQueueTargets.filter((id) => id !== targetId) }));
        const next = get().followupQueue.find((item) => item.targetId === targetId);
        if (!next || get().streamingIds.includes(targetId)) return;
        set((s) => ({ followupQueue: s.followupQueue.filter((item) => item.id !== next.id) }));
        void get().send(next.targetId, next.targetKind, next.text, {
          projectId: next.projectId,
          modelSelection: next.modelSelection,
          runMode: next.runMode,
        });
      },
      send: async (targetId, targetKind, text, context) => {
        const state = get();
        const pendingBag =
          typeof window !== "undefined"
            ? (window as unknown as { __agentsamComposerAttachments?: { targetId?: string; accountId?: string; attachments?: ChatImageReference[] } })
                .__agentsamComposerAttachments
            : undefined;
        const pendingAttachments =
          pendingBag?.targetId === targetId && Array.isArray(pendingBag.attachments)
            ? pendingBag.attachments
            : [];
        if (typeof window !== "undefined" && pendingBag?.targetId === targetId) {
          delete (window as unknown as { __agentsamComposerAttachments?: unknown }).__agentsamComposerAttachments;
        }
        const draft = (text ?? state.drafts[targetId] ?? "").trim();
        if (!draft && !pendingAttachments.length) return;
        // A chat turn is not a durable goal. Goals are created explicitly via
        // the goal editor; quick questions and single replies never self-enroll.
        if (state.streamingIds.includes(targetId)) {
          const queued: FollowupQueuedSend = {
            id: uid(),
            targetId,
            targetKind,
            text: draft.slice(0, 12000),
            projectId: state.activeProjectId,
            modelSelection: { ...state.modelSelection },
            runMode: context?.runMode ?? state.runModes[targetId] ?? defaultRunModeForTarget(targetKind),
            createdAt: Date.now(),
          };
          set((s) => ({
            drafts: { ...s.drafts, [targetId]: "" },
            followupQueue: [...s.followupQueue, queued],
          }));
          return;
        }

        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        if (offline) {
          const noteId = uid();
          const queued: OfflineQueuedSend = {
            id: uid(),
            targetId,
            targetKind,
            text: draft.slice(0, 12000),
            noteId,
            runMode: context?.runMode ?? state.runModes[targetId] ?? defaultRunModeForTarget(targetKind),
            createdAt: Date.now(),
          };
          const userMsg: ChatMessage = {
            id: uid(),
            role: "user",
            content: queued.text,
            createdAt: Date.now(),
          };
          const note: ChatMessage = {
            id: noteId,
            role: "assistant",
            content:
              "Saved on this device — you're offline. Open **CLI** from the rail to keep shipping locally. This message will retry when you're back online.",
            createdAt: Date.now(),
          };
          if (targetKind === "chat") {
            set((s) => ({
              drafts: { ...s.drafts, [targetId]: "" },
              offlineQueue: [...s.offlineQueue, queued],
              chats: s.chats.map((t) =>
                t.id === targetId
                  ? {
                      ...t,
                      title: t.messages.length === 0 ? titleFromText(userMsg.content) : t.title,
                      updatedAt: Date.now(),
                      messages: [...t.messages, userMsg, note],
                    }
                  : t,
              ),
            }));
          } else {
            set((s) => ({
              drafts: { ...s.drafts, [targetId]: "" },
              offlineQueue: [...s.offlineQueue, queued],
              sideTabs: s.sideTabs.map((t) =>
                t.id === targetId ? { ...t, messages: [...t.messages, userMsg, note] } : t,
              ),
            }));
          }
          return;
        }

        const userMsg: ChatMessage = {
          id: uid(),
          role: "user",
          content: draft.slice(0, 12000),
          createdAt: Date.now(),
          ...(pendingAttachments.length ? { metadata: { attachments: pendingAttachments } } : {}),
        };
        const assistantId = uid();
        const assistantMsg: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
        };

        if (targetKind === "chat") {
          set((s) => ({
            drafts: { ...s.drafts, [targetId]: "" },
            chats: s.chats.map((t) =>
              t.id === targetId
                ? {
                    ...t,
                    title: t.messages.length === 0 ? titleFromText(userMsg.content) : t.title,
                    updatedAt: Date.now(),
                    messages: [...t.messages, userMsg, assistantMsg],
                  }
                : t,
            ),
            streamingIds: [...s.streamingIds, targetId],
          }));
        } else {
          set((s) => ({
            drafts: { ...s.drafts, [targetId]: "" },
            sideTabs: s.sideTabs.map((t) =>
              t.id === targetId ? { ...t, messages: [...t.messages, userMsg, assistantMsg] } : t,
            ),
            streamingIds: [...s.streamingIds, targetId],
          }));
        }

        const controller = new AbortController();
        aborts.set(targetId, controller);

        const after = get();
        let history: ChatMessage[] = [];
        let parentTitle: string | null = null;
        let parentExcerpt: string | null = null;
        if (targetKind === "chat") {
          history = after.chats.find((t) => t.id === targetId)?.messages ?? [];
        } else {
          const tab = after.sideTabs.find((t) => t.id === targetId);
          history = tab?.messages ?? [];
          const parent = after.chats.find((t) => t.id === tab?.parentChatId);
          parentTitle = parent?.title ?? null;
          parentExcerpt = excerptOf(parent);
        }

        const payload = history
          .filter((m) => m.id !== assistantId && (
            m.content.trim() || (Array.isArray(m.metadata?.attachments) && m.metadata.attachments.length > 0)
          ))
          .slice(-16)
          .map((m) => ({
            role: m.role, content: m.content,
            attachments: Array.isArray(m.metadata?.attachments)
              ? m.metadata.attachments as ChatImageReference[] : [],
          }));

        const projectId = context?.projectId ?? after.activeProjectId;
        const project = after.projects.find((p) => p.id === projectId) ?? after.projects[0] ?? null;

        const write = (content: string, done = false) => {
          if (targetKind === "chat") {
            set((s) => ({
              chats: s.chats.map((t) =>
                t.id === targetId
                  ? {
                      ...t,
                      updatedAt: Date.now(),
                      messages: t.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)),
                      files: done ? mergeArtifacts(t.files, extractArtifacts(content, t.id)) : t.files,
                    }
                  : t,
              ),
            }));
          } else {
            set((s) => ({
              sideTabs: s.sideTabs.map((t) =>
                t.id === targetId
                  ? {
                      ...t,
                      messages: t.messages.map((m) => (m.id === assistantId ? { ...m, content } : m)),
                    }
                  : t,
              ),
            }));
          }
          if (done) {
            const captured = extractArtifacts(content, targetId);
            if (captured.length) {
              const parentId = get().activeProjectId;
              set((s) => ({
                projects: s.projects.map((p) =>
                  p.id === parentId ? { ...p, files: mergeArtifacts(p.files, captured), updatedAt: Date.now() } : p,
                ),
              }));
            }
          }
        };

        let completed = false;
        const visualOperationId = "agent-turn:" + assistantId;
        const taskSummary = draft.replace(/\s+/g, " ").trim().slice(0, 180);
        const isCoworker = targetKind === "side";
        const initialLabel = isCoworker ? "Briefing co-worker" : "Understanding your request";
        const turnMode = context?.runMode ?? after.runModes[targetId] ?? defaultRunModeForTarget(targetKind);
        const planningLabel = turnMode === "plan"
          ? "Outlining the plan"
          : isCoworker ? "Preparing co-worker response" : "Preparing response";
        const responseLabel = isCoworker ? "Co-worker drafting response" : "Writing response";
        localStudioRuntimeVisuals.startAgentTurn(
          visualOperationId,
          initialLabel,
          taskSummary || undefined,
          targetId,
        );
        localStudioRuntimeVisuals.progressPoints(
          visualOperationId,
          "thinking",
          initialLabel,
          0,
          5,
          taskSummary || undefined,
          "phase-points",
          targetId,
        );
        const visualWorkspace = selectStudioWorkspaceForTurn(draft, workspacePayload(project));
        localStudioRuntimeVisuals.progressPoints(
          visualOperationId,
          visualWorkspace.length > 0 ? "context_loading" : "thinking",
          visualWorkspace.length > 0
            ? (isCoworker ? "Co-worker loading shared context" : "Loading workspace context")
            : "Preparing request context",
          1,
          5,
          visualWorkspace.length > 0 ? project?.name : taskSummary || undefined,
          "phase-points",
          targetId,
        );
        localStudioRuntimeVisuals.progressPoints(
          visualOperationId,
          "thinking",
          planningLabel,
          2,
          5,
          taskSummary || undefined,
          "phase-points",
          targetId,
        );
        try {
          let assembled = "";
          let sawDelta = false;
          await streamChat({
            messages: payload,
            accountId: pendingBag?.accountId || "",
            surface: targetKind,
            runMode: turnMode,
            provider: context?.modelSelection?.provider ?? after.modelSelection?.provider,
            model_id: context?.modelSelection?.model_id ?? after.modelSelection?.model_id,
            parentTitle,
            parentExcerpt,
            workspace: visualWorkspace,
            signal: controller.signal,
            operationId: visualOperationId,
            onActivity: (event) => localStudioRuntimeVisuals.reportRuntimeEvent(event, targetId),
            onDelta: (chunk) => {
              if (!sawDelta) {
                sawDelta = true;
                localStudioRuntimeVisuals.markAgentTurnStreaming(
                  visualOperationId,
                  responseLabel,
                  taskSummary || undefined,
                  targetId,
                );
                localStudioRuntimeVisuals.progressPoints(
                  visualOperationId,
                  "thinking",
                  responseLabel,
                  3,
                  5,
                  taskSummary || undefined,
                  "phase-points",
                  targetId,
                );
              }
              assembled += chunk;
              write(assembled, false);
            },
          });
          write(assembled, true);
          localStudioRuntimeVisuals.progressPoints(
            visualOperationId,
            targetKind === "side" ? "verification" : "verification",
            targetKind === "side" ? "Preparing co-worker handoff" : "Finalizing response",
            4,
            5,
            targetKind === "side" ? parentTitle || project.name : taskSummary || undefined,
            "phase-points",
            targetId,
          );
          if (targetKind === "side") {
            const tab = get().sideTabs.find((t) => t.id === targetId);
            if (tab?.reportToLead && assembled.trim()) {
              const brief =
                assembled.trim().length > 1200
                  ? `${assembled.trim().slice(0, 1200).trim()}…`
                  : assembled.trim();
              get().reportCoworkerToLead(targetId, brief);
            }
          }
          localStudioRuntimeVisuals.progressPoints(
            visualOperationId,
            "verification",
            targetKind === "side" ? "Co-worker handoff ready" : "Response ready",
            5,
            5,
            targetKind === "side" ? parentTitle || project.name : undefined,
            "phase-points",
            targetId,
          );
          completed = true;
          localStudioRuntimeVisuals.completeAgentTurn(visualOperationId, targetId);
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            const message = err instanceof Error ? err.message : "The studio model could not reply.";
            localStudioRuntimeVisuals.failAgentTurn(visualOperationId, message, targetId);
            write(message, true);
            set((s) => ({
              pausedQueueTargets: s.pausedQueueTargets.includes(targetId)
                ? s.pausedQueueTargets
                : [...s.pausedQueueTargets, targetId],
            }));
          } else {
            localStudioRuntimeVisuals.completeAgentTurn(visualOperationId, targetId);
          }
        } finally {
          aborts.delete(targetId);
          set((s) => ({ streamingIds: s.streamingIds.filter((x) => x !== targetId) }));
          if (completed && !get().pausedQueueTargets.includes(targetId)) {
            const next = get().followupQueue.find((item) => item.targetId === targetId);
            if (next) {
              set((s) => ({ followupQueue: s.followupQueue.filter((item) => item.id !== next.id) }));
              void get().send(next.targetId, next.targetKind, next.text, {
                projectId: next.projectId,
                modelSelection: next.modelSelection,
                runMode: next.runMode,
              });
            }
          }
        }
      },
    }),
    {
      name: "agentsam-work-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 5,
      merge: (persisted, current) => {
        // Legacy V1 used "trails" for conversations. Read that shape only to
        // migrate in place; never write the obsolete keys again. Retaining the
        // storage namespace protects saved messages on existing devices.
        type LegacyStored = Omit<Partial<WorkState>, "navView" | "sideTabs" | "goals"> & {
          trails?: Chat[]; activeTrailId?: string; navView?: NavView | "trails";
          sideTabs?: Array<SideTab & { parentTrailId?: string | null; keptTrailId?: string | null }>;
          goals?: Record<string, WorkGoal & { trailId?: string }>;
        };
        const raw = (persisted ?? {}) as LegacyStored;
        const normalized = {
          ...raw,
          chats: Array.isArray(raw.chats) ? raw.chats : raw.trails,
          activeChatId: raw.activeChatId ?? raw.activeTrailId,
          navView: raw.navView === "trails" ? "chats" as const : raw.navView,
          sideTabs: (raw.sideTabs ?? []).map(tab => ({
            ...tab,
            parentChatId: tab.parentChatId ?? tab.parentTrailId ?? null,
            keptChatId: tab.keptChatId ?? tab.keptTrailId ?? null,
          })),
        } as Partial<WorkState>;
        const shaped = ensureShape(normalized);
        return {
          ...current,
          ...shaped,
          offlineQueue: Array.isArray(raw.offlineQueue) ? raw.offlineQueue.map(item => ({
            ...item, targetKind: (item.targetKind as string) === "trail" ? "chat" as const : item.targetKind,
          })) : [],
          followupQueue: Array.isArray(raw.followupQueue) ? raw.followupQueue.map(item => ({
            ...item, targetKind: (item.targetKind as string) === "trail" ? "chat" as const : item.targetKind,
          })) : [],
          pausedQueueTargets: Array.isArray(raw.pausedQueueTargets) ? raw.pausedQueueTargets : [],
          goals: raw.goals && typeof raw.goals === "object"
            ? Object.fromEntries(Object.entries(raw.goals).map(([id, goal]) => [id, {
              ...goal, chatId: goal.chatId ?? goal.trailId ?? id,
            }])) : {},
        };
      },
      partialize: (s) => ({
        projects: s.projects.map((p) =>
          p.kind === "filesystem"
            ? {
                ...p,
                // Never persist real repository bytes as localStorage authority.
                files: [],
              }
            : p,
        ),
        activeProjectId: s.activeProjectId,
        chats: s.chats,
        activeChatId: s.activeChatId,
        drafts: s.drafts,
        sidebarOpen: s.sidebarOpen,
        sideOpen: s.sideOpen,
        terminalOpen: s.terminalOpen,
        terminalHeight: s.terminalHeight,
        navView: s.navView,
        modelSelection: s.modelSelection,
        modelSelectionMode: s.modelSelectionMode,
        runModes: s.runModes,
        sideTabs: s.sideTabs,
        activeSideTabId: s.activeSideTabId,
        workSurface: s.workSurface,
        offlineQueue: s.offlineQueue,
        followupQueue: s.followupQueue,
        pausedQueueTargets: s.pausedQueueTargets,
        goals: s.goals,
      }),
    },
  ),
);

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function useActiveChat() {
  return useWorkStore((s) => s.chats.find((t) => t.id === s.activeChatId) ?? s.chats[0]!);
}

export function useActiveProject(): Project | null {
  return useWorkStore((s) => s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0] ?? null);
}

export function useActiveSideTab() {
  return useWorkStore((s) => s.sideTabs.find((t) => t.id === s.activeSideTabId) ?? null);
}

export function useProjectTrails() {
  const projectId = useWorkStore((s) => s.activeProjectId);
  return useWorkStore((s) => s.chats.filter((t) => t.projectId === projectId));
}
