import { useActiveSideTab, useWorkStore } from "@/lib/work/store";

/**
 * Only one placement mounts the active session at a time. Moving a session
 * reattaches its existing xterm/PTY runtime instead of creating a duplicate.
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
