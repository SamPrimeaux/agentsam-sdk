import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  DatabaseEditorApp,
  createDatabaseStudioClient,
} from "@inneranimalmedia/agentsam-database-editor/ui";

/**
 * Local Studio host adapter for the portable Database Editor package.
 *
 * Provider discovery, metrics, table browsing, SQL, and CRUD are served by the
 * authenticated Worker at /api/database/*. Local Studio owns identity/OAuth;
 * the package owns the database product UI.
 */
export function DatabasePage() {
  const navigate = useNavigate();
  const client = useMemo(() => createDatabaseStudioClient("/api/database"), []);

  return (
    <DatabaseEditorApp
      client={client}
      onOpenConnections={() => {
        void navigate({ to: "/settings/integrations" as never });
      }}
    />
  );
}
