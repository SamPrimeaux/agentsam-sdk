import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useWorkStore } from "@/lib/work/store";
import { isPackagedDesktop } from "@/lib/desktop/tauri";

/**
 * Legacy /cli bookmarks open the existing Terminal in AgentSam's side panel.
 * The terminal session remains intact; CLI is not an independent app page.
 */
export const Route = createFileRoute("/(apps)/cli")({
  component: TerminalShortcut,
});

function TerminalShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const openTerminal = () => {
      if (!active) return;
      const state = useWorkStore.getState();
      const existing = state.sideTabs.find((tab) => tab.kind === "terminal");
      if (existing) state.setActiveSideTab(existing.id);
      else state.openSideTab("terminal", { ephemeral: false });
      state.setSideOpen(true);
      if (isPackagedDesktop()) window.location.hash = "#/agentsam";
      else void navigate({ to: "/agentsam", replace: true });
    };
    if (useWorkStore.persist.hasHydrated()) openTerminal();
    else void useWorkStore.persist.rehydrate().then(openTerminal);
    return () => { active = false; };
  }, [navigate]);
  return null;
}
