/**
 * Shell commands (native Shell menu, command palette, shortcuts) acting on the
 * focused terminal session. These only drive the existing session store and
 * runtime; they do not own PTY or xterm lifecycle.
 */
import { create } from "zustand";
import { toast } from "sonner";
import { getTauriInvoke } from "@/lib/desktop/tauri";
import { navigateApp } from "@/lib/work/navigate";
import { useWorkStore } from "@/lib/work/store";
import { resolveTerminalHostPlacement } from "@/lib/work/terminal-host";
import {
  TERMINAL_PROFILES,
  resolveSessionAppearance,
  useTerminalAppearanceStore,
  type TerminalProfileId,
} from "@/lib/work/terminal-appearance";
import { clearTerminalScrollback, getSharedTerminalRun } from "@/lib/work/terminal-runtime";
import { activeTerminalSession, useTerminalSessionStore } from "@/lib/work/terminal-sessions";

export type TerminalDialogState =
  | null
  | { kind: "rename" | "command" | "appearance"; sessionId: string };

export const useTerminalUiStore = create<{
  dialog: TerminalDialogState;
  open(dialog: Exclude<TerminalDialogState, null>): void;
  close(): void;
}>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
}));

/** The session under DOM focus (split/tile), else the selected tab. */
export function targetSessionId(): string {
  if (typeof document !== "undefined") {
    const focused = document.activeElement?.closest?.("[data-terminal-viewport]");
    const id = focused?.getAttribute("data-terminal-viewport");
    if (id && useTerminalSessionStore.getState().sessions.some((s) => s.id === id)) return id;
  }
  return activeTerminalSession().id;
}

function targetSession() {
  const id = targetSessionId();
  const { sessions } = useTerminalSessionStore.getState();
  return sessions.find((s) => s.id === id) ?? activeTerminalSession();
}

function workspaceCwd(): string | undefined {
  const { projects, activeProjectId } = useWorkStore.getState();
  return projects.find((p) => p.id === activeProjectId)?.workspaceRoot || undefined;
}

/** Make the terminal visible somewhere (drawer unless it already lives in the side panel / page). */
export function ensureTerminalVisible() {
  const state = useWorkStore.getState();
  const active = state.sideTabs.find((tab) => tab.id === state.activeSideTabId);
  const placement = resolveTerminalHostPlacement({
    terminalOpen: state.terminalOpen,
    sideOpen: state.sideOpen,
    activeSideKind: active?.kind,
  });
  const onTerminalPage = typeof window !== "undefined" && /(^|#)\/cli(\/|$|\?)/.test(window.location.hash + window.location.pathname);
  if (!placement && !onTerminalPage) state.setTerminalOpen(true);
}

export function shellNewTerminal(input: { cwd?: string; title?: string } = {}): string {
  ensureTerminalVisible();
  return useTerminalSessionStore.getState().createSession({ cwd: input.cwd ?? workspaceCwd(), title: input.title });
}

/** Same connection and cwd as the focused tab; carries profile and a11y prefs, not custom colors. */
export function shellNewTab(): string {
  ensureTerminalVisible();
  const source = targetSession();
  const id = useTerminalSessionStore.getState().duplicateSession(source.id);
  const override = useTerminalAppearanceStore.getState().sessions[source.id];
  if (override) {
    useTerminalAppearanceStore.getState().patchSession(id, {
      profileId: override.profileId,
      fontSize: override.fontSize,
      lineHeight: override.lineHeight,
    });
  }
  return id;
}

/** Runs once the new session's shell is attached; polling because the runtime boots lazily. */
export async function shellNewCommand(command: string): Promise<boolean> {
  const line = command.trim();
  if (!line) return false;
  const id = shellNewTerminal({ title: line.length > 24 ? `${line.slice(0, 23)}…` : line });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = getSharedTerminalRun(id);
    if (run) {
      await run(line);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  toast.error("Terminal did not become ready; command was not run.");
  return false;
}

export function shellCloseTab() {
  const id = targetSessionId();
  useTerminalSessionStore.getState().closeSession(id);
  useTerminalAppearanceStore.getState().prune(useTerminalSessionStore.getState().sessions.map((s) => s.id));
}

export function shellCycleTab(direction: 1 | -1) {
  const { sessions, setActiveSession } = useTerminalSessionStore.getState();
  if (sessions.length < 2) return;
  const index = sessions.findIndex((s) => s.id === targetSessionId());
  const next = sessions[(index + direction + sessions.length) % sessions.length]!;
  setActiveSession(next.id);
}

export function shellSetProfile(profileId: TerminalProfileId) {
  const session = targetSession();
  useTerminalAppearanceStore.getState().setProfile(session.id, profileId);
}

export function shellUseProfileAsDefault() {
  const session = targetSession();
  const { profileId, profileLabel } = resolveSessionAppearance(session.id);
  useTerminalAppearanceStore.getState().setDefaultProfile(profileId);
  toast(`New terminals will use the ${profileLabel} profile.`);
}

export function shellResetAppearance() {
  const session = targetSession();
  useTerminalAppearanceStore.getState().resetSession(session.id);
  void closeNativeColorPanel();
}

export async function shellEditBackgroundColor() {
  const session = targetSession();
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      if (await invoke("native_color_panel_supported", {})) {
        const { theme } = resolveSessionAppearance(session.id);
        await invoke("native_color_panel_open", {
          sessionId: session.id,
          title: `Background Color — ${session.title}${session.cwd ? ` (${session.cwd})` : ""}`,
          hex: theme.background,
        });
        return;
      }
    } catch (error) {
      toast.error(`Native color panel unavailable (${String(error)}); using the in-app picker.`);
    }
  }
  useTerminalUiStore.getState().open({ kind: "appearance", sessionId: session.id });
}

async function closeNativeColorPanel() {
  const invoke = getTauriInvoke();
  if (!invoke) return;
  try {
    await invoke("native_color_panel_close", {});
  } catch {
    /* panel was not open */
  }
}

export function shellClearScrollback() {
  const id = targetSessionId();
  if (!clearTerminalScrollback(id)) toast("Terminal is not attached yet.");
}

export function shellOpenWorkspace() {
  navigateApp("/cli");
}

export function shellRenameTab() {
  useTerminalUiStore.getState().open({ kind: "rename", sessionId: targetSessionId() });
}

export function shellPromptCommand() {
  useTerminalUiStore.getState().open({ kind: "command", sessionId: targetSessionId() });
}

export function shellOpenAppearance() {
  useTerminalUiStore.getState().open({ kind: "appearance", sessionId: targetSessionId() });
}

export function terminalProfileLabel(id: TerminalProfileId) {
  return TERMINAL_PROFILES.find((profile) => profile.id === id)?.label ?? id;
}
