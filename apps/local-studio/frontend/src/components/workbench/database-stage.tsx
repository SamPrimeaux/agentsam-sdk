import { useMemo } from "react";
import { DatabaseEditorApp } from "@inneranimalmedia/agentsam-database-editor/frontend";
import { createLocalStudioDatabaseClient } from "@/lib/database/createLocalStudioDatabaseClient";
import { useWorkStore } from "@/lib/work/store";

/** Workbench side-panel surface for the real Database Editor package. */
export function DatabaseStage() {
  const workspaceRoot = useWorkStore(
    (s) => s.projects.find((project) => project.id === s.activeProjectId)?.workspaceRoot,
  );
  const client = useMemo(
    () => createLocalStudioDatabaseClient("/api/database", { cwd: workspaceRoot || null }),
    [workspaceRoot],
  );

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
      onAuthenticate={() => {
        window.dispatchEvent(new CustomEvent("agentsam:identity-open"));
      }}

    />
  );
}
