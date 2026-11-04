import { useMemo } from "react";
import { DatabaseEditorApp } from "@inneranimalmedia/agentsam-database-editor/frontend";
import { createLocalStudioDatabaseClient } from "@/lib/database/createLocalStudioDatabaseClient";
import { useWorkStore } from "@/lib/work/store";

/**
 * Local Studio host adapter for the portable Database Editor package.
 *
 * Provider discovery, metrics, table browsing, SQL, and CRUD are served by the
 * authenticated Worker at /api/database/*. Local SQLite uses the machine-local
 * bridge (Tauri / Node) — never a fake browser source. Bound D1/Hyperdrive stay
 * owner-gated on the Worker (deployment owner only).
 */
export function DatabasePage() {
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
      onOpenConnections={() => {
        window.dispatchEvent(
          new CustomEvent("agentsam:navigate", { detail: { to: "/settings/integrations" } }),
        );
      }}
      onAuthenticate={() => {
        window.dispatchEvent(new CustomEvent("agentsam:identity-open"));
      }}

    />
  );
}
