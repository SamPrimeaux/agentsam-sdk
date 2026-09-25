import { useActiveSideTab, useWorkStore } from "@/lib/work/store";

/** Shared local terminal session id until ExecOS/PTY transport attaches. */
export const LOCAL_TERMINAL_SESSION_ID = "local-default";

/**
 * Only one TerminalPane mounts at a time so drawer and side panel share one
 * xterm session (reattach via terminal-runtime, not a second shell).
 */
export type TerminalHostPlacement = "drawer" | "side" | null;

export function resolveTerminalHostPlacement(state: {
  terminalOpen: boolean;
  sideOpen: boolean;
  activeSideKind: string | null | undefined;
}): TerminalHostPlacement {
  if (state.sideOpen && state.activeSideKind === "terminal") return "side";
  if (state.terminalOpen) return "drawer";
  return null;
}

export function useTerminalHostPlacement(): TerminalHostPlacement {
  const terminalOpen = useWorkStore((s) => s.terminalOpen);
  const sideOpen = useWorkStore((s) => s.sideOpen);
  const tab = useActiveSideTab();
  return resolveTerminalHostPlacement({
    terminalOpen,
    sideOpen,
    activeSideKind: tab?.kind,
  });
}
