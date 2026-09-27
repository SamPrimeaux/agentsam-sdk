import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DatabaseEditorApp } from "@inneranimalmedia/agentsam-database-editor/frontend";
import { createLocalStudioDatabaseClient } from "@/lib/database/createLocalStudioDatabaseClient";
import { publishDatabaseAssistantContext } from "@/lib/database/assistantContext";
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
  const navigate = useNavigate();
  const client = useMemo(() => createLocalStudioDatabaseClient("/api/database"), []);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const setSideOpen = useWorkStore((s) => s.setSideOpen);

  return (
    <DatabaseEditorApp
      client={client}
      localHost={client.localHost}
      onOpenConnections={() => {
        void navigate({ to: "/settings/integrations" as never });
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
