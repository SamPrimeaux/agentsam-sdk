import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useWorkStore } from "@/lib/work/store";

/**
 * Legacy redirect only: widgets are installed from Settings and rendered
 * inside the existing AgentSam Side Stage New Tab. No separate widget app.
 */
function LegacyWidgetsRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    const state = useWorkStore.getState();
    const existing = state.sideTabs.find(tab => tab.kind === "newtab");
    if (existing) state.setActiveSideTab(existing.id);
    else state.openSideTab("newtab", { ephemeral: false });
    state.setSideOpen(true);
    void navigate({ to: "/admin/agentsam", replace: true });
  }, [navigate]);
  return <p role="status" className="p-4 text-sm text-muted-foreground">Opening your widgets in AgentSam Work…</p>;
}

export const Route = createFileRoute("/(apps)/admin/widgets")({
  component: LegacyWidgetsRedirect,
});
