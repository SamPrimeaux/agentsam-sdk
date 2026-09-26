import { useMemo } from "react";
import {
  DatabaseEditorApp,
  createDatabaseStudioClient,
} from "@inneranimalmedia/agentsam-database-editor/ui";

/** Workbench side-panel surface for the real Database Editor package. */
export function DatabaseStage() {
  const client = useMemo(() => createDatabaseStudioClient("/api/database"), []);

  return (
    <DatabaseEditorApp
      client={client}
      compact
      onOpenConnections={() => {
        window.dispatchEvent(
          new CustomEvent("agentsam:navigate", {
            detail: { to: "/settings/integrations" },
          }),
        );
      }}
    />
  );
}
