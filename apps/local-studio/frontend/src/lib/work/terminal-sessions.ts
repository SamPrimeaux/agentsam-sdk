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
  splitView: boolean;
  secondarySessionId: string | null;
  /** A persisted, ordered set of independent PTY sessions visible in tile mode. */
  gridView: boolean;
  gridSessionIds: string[];
  gridColumnFraction: number;
  gridFirstRowFraction: number;
  setGridColumnFraction(value: number): void;
  setGridFirstRowFraction(value: number): void;
  setGridView(enabled: boolean): void;
  setGridSession(slot: number, id: string): void;
  setSplitView(enabled: boolean): void;
  setSecondarySession(id: string | null): void;
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
      splitView: false,
      secondarySessionId: null,
      gridView: false,
      gridSessionIds: [],
      gridColumnFraction: 0.5,
      gridFirstRowFraction: 1 / 3,
      setGridColumnFraction(value) {
        if (!Number.isFinite(value)) return;
        set({ gridColumnFraction: Math.min(0.78, Math.max(0.22, value)) });
      },
      setGridFirstRowFraction(value) {
        if (!Number.isFinite(value)) return;
        set({ gridFirstRowFraction: Math.min(0.55, Math.max(0.2, value)) });
      },
      setGridView(enabled) {
        set((state) => {
          if (!enabled) return { gridView: false };
          const validIds = new Set(state.sessions.map((session) => session.id));
          const ids = [state.activeSessionId, ...(state.gridSessionIds ?? []), ...state.sessions.map((session) => session.id)];
          const gridSessionIds = [...new Set(ids)].filter((id) => validIds.has(id)).slice(0, 5);
          return { gridView: true, splitView: false, gridSessionIds };
        });
      },
      setGridSession(slot, id) {
        if (!Number.isInteger(slot) || slot < 0 || slot >= 5) return;
        set((state) => {
          if (!state.sessions.some((session) => session.id === id)) return state;
          const ids = [...(state.gridSessionIds ?? [])];
          if (slot >= ids.length) return state;
          const previous = ids.indexOf(id);
          if (previous >= 0 && previous !== slot) ids[previous] = ids[slot]!;
          ids[slot] = id;
          return { gridSessionIds: ids, activeSessionId: id };
        });
      },
      setSplitView(enabled) {
        set((state) => ({
          splitView: enabled && state.sessions.some((session) => session.id !== state.activeSessionId),
          gridView: false,
        }));
      },
      setSecondarySession(id) {
        set((state) => ({
          secondarySessionId: id && id !== state.activeSessionId && state.sessions.some((session) => session.id === id)
            ? id : null,
        }));
      },
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
        set((state) => {
          const gridSessionIds = state.gridView
            ? (state.gridSessionIds ?? []).length < 5
              ? [...(state.gridSessionIds ?? []), id]
              : (state.gridSessionIds ?? []).map((existing) => existing === state.activeSessionId ? id : existing)
            : state.gridSessionIds;
          return { sessions: [...state.sessions, session], activeSessionId: id, gridSessionIds };
        });
        return id;
      },
      closeSession(id) {
        set((state) => {
          const index = state.sessions.findIndex((item) => item.id === id);
          const remaining = state.sessions.filter((item) => item.id !== id);
          if (!remaining.length) return { sessions: [initialSession], activeSessionId: INITIAL_SESSION_ID, splitView: false, secondarySessionId: null, gridView: false, gridSessionIds: [] };
          const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)]!;
          const activeSessionId = state.activeSessionId === id ? next.id : state.activeSessionId;
          const secondarySessionId = state.secondarySessionId === id
            ? remaining.find((session) => session.id !== activeSessionId)?.id ?? null
            : state.secondarySessionId;
          return { sessions: remaining, activeSessionId, secondarySessionId,
            gridSessionIds: (state.gridSessionIds ?? []).filter((sessionId) => sessionId !== id),
            gridView: state.gridView && remaining.length > 0,
            splitView: state.splitView && secondarySessionId !== null && secondarySessionId !== activeSessionId };
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
        set((state) => {
          if (!state.sessions.some((item) => item.id === id)) return state;
          // Selecting the adjacent terminal swaps the panes; never mount a PTY twice.
          const secondarySessionId = state.splitView && state.secondarySessionId === id
            ? state.activeSessionId : state.secondarySessionId;
          const gridSessionIds = state.gridView && !(state.gridSessionIds ?? []).includes(id)
            ? (state.gridSessionIds ?? []).length < 5
              ? [...(state.gridSessionIds ?? []), id]
              : (state.gridSessionIds ?? []).map((sessionId, index) => index === 0 ? id : sessionId)
            : state.gridSessionIds;
          return { activeSessionId: id, secondarySessionId, gridSessionIds };
        });
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
        splitView: state.splitView,
        secondarySessionId: state.secondarySessionId,
        gridView: state.gridView,
        gridSessionIds: state.gridSessionIds,
        gridColumnFraction: state.gridColumnFraction,
        gridFirstRowFraction: state.gridFirstRowFraction,
      }),
    },
  ),
);

export function activeTerminalSession() {
  const state = useTerminalSessionStore.getState();
  return state.sessions.find((item) => item.id === state.activeSessionId) || state.sessions[0]!;
}
