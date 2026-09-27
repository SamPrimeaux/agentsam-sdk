import { useMemo } from "react";
import { DatabaseEditorApp } from "@inneranimalmedia/agentsam-database-editor/frontend";
import { createLocalStudioDatabaseClient } from "@/lib/database/createLocalStudioDatabaseClient";
import { publishDatabaseAssistantContext } from "@/lib/database/assistantContext";
import { useWorkStore } from "@/lib/work/store";

/** Workbench side-panel surface for the real Database Editor package. */
export function DatabaseStage() {
  const client = useMemo(() => createLocalStudioDatabaseClient("/api/database"), []);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const setSideOpen = useWorkStore((s) => s.setSideOpen);

  return (
    <DatabaseEditorApp
      client={client}
      localHost={client.localHost}
      compact
      onOpenConnections={() => {
        window.dispatchEvent(
          new CustomEvent("agentsam:navigate", {
            detail: { to: "/settings/integrations" },
          }),
        );
      }}
      onAskAgentSam={(ctx) => {
        setSideOpen(true);
        openSideTab("chat", {
          title: "Database · Co-worker",
          ephemeral: false,
        });
        publishDatabaseAssistantContext(ctx);
      }}
    />
  );
}
