import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type StudioTerminalSession = {
  id: string;
  title: string;
  connectionId: string;
  instanceId?: string;
  lane: "local" | "remote" | "sandbox";
  cwd?: string;
  ptySlot: number;
  state: "connecting" | "connected" | "exited" | "disconnected" | "error" | "degraded";
  shell?: string;
  runtimeLabel?: string;
  error?: string;
};

type TerminalSessionState = {
  sessions: StudioTerminalSession[];
  activeSessionId: string;
  createSession(input?: Partial<Pick<StudioTerminalSession, "title" | "cwd" | "connectionId" | "instanceId" | "lane" | "runtimeLabel">>): string;
  closeSession(id: string): void;
  renameSession(id: string, title: string): void;
  duplicateSession(id: string): string;
  setActiveSession(id: string): void;
  patchSession(id: string, patch: Partial<StudioTerminalSession>): void;
};

const INITIAL_SESSION_ID = "term_local_1";
const initialSession: StudioTerminalSession = {
  id: INITIAL_SESSION_ID,
  title: "Terminal",
  connectionId: "runtime-auto",
  lane: "local",
  ptySlot: 0,
  state: "connecting",
  runtimeLabel: "Resolving runtime",
};

function nextId() {
  return `term_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useTerminalSessionStore = create<TerminalSessionState>()(
  persist(
    (set, get) => ({
      sessions: [initialSession],
      activeSessionId: INITIAL_SESSION_ID,
      createSession(input = {}) {
        const connectionId = input.connectionId || "runtime-auto";
        const localSessions = get().sessions.filter((item) => item.connectionId === connectionId);
        const slot = localSessions.reduce((max, item) => Math.max(max, item.ptySlot), -1) + 1;
        const id = nextId();
        const session: StudioTerminalSession = {
          id,
          title: input.title || `Terminal ${slot + 1}`,
          connectionId,
          instanceId: input.instanceId,
          lane: input.lane || "local",
          cwd: input.cwd,
          ptySlot: slot,
          state: "connecting",
          runtimeLabel: input.runtimeLabel || "Resolving runtime",
        };
        set((state) => ({ sessions: [...state.sessions, session], activeSessionId: id }));
        return id;
      },
      closeSession(id) {
        set((state) => {
          const index = state.sessions.findIndex((item) => item.id === id);
          const remaining = state.sessions.filter((item) => item.id !== id);
          if (!remaining.length) return { sessions: [initialSession], activeSessionId: INITIAL_SESSION_ID };
          const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)]!;
          return { sessions: remaining, activeSessionId: state.activeSessionId === id ? next.id : state.activeSessionId };
        });
      },
      renameSession(id, title) {
        const clean = title.trim();
        if (!clean) return;
        set((state) => ({ sessions: state.sessions.map((item) => (item.id === id ? { ...item, title: clean } : item)) }));
      },
      duplicateSession(id) {
        const source = get().sessions.find((item) => item.id === id);
        return get().createSession({
          cwd: source?.cwd,
          connectionId: source?.connectionId,
          instanceId: source?.instanceId,
          lane: source?.lane,
          runtimeLabel: source?.runtimeLabel,
        });
      },
      setActiveSession(id) {
        if (get().sessions.some((item) => item.id === id)) set({ activeSessionId: id });
      },
      patchSession(id, patch) {
        set((state) => ({ sessions: state.sessions.map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
      },
    }),
    {
      name: "agentsam-terminal-sessions-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions.map((item) => ({ ...item, state: "disconnected" as const, error: undefined })),
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);

export function activeTerminalSession() {
  const state = useTerminalSessionStore.getState();
  return state.sessions.find((item) => item.id === state.activeSessionId) || state.sessions[0]!;
}
