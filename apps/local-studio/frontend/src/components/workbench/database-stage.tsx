import { Database } from "lucide-react";
import { InstallableEmptyState } from "@/components/database/InstallableEmptyState";
import { DATABASE_EDITOR_APP } from "@inneranimalmedia/agentsam-database-editor/manifest";

/** Workbench side-panel surface for Database Editor. */
export function DatabaseStage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto p-4">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="size-3.5" aria-hidden />
        Database Editor · localhost preview
      </div>
      <InstallableEmptyState
        installable={DATABASE_EDITOR_APP}
        icon={<Database className="size-8" aria-hidden />}
        onInstall={() => {
          window.dispatchEvent(
            new CustomEvent("agentsam:navigate", { detail: { to: "/database" } }),
          );
        }}
        onPreview={() => {
          window.dispatchEvent(
            new CustomEvent("agentsam:navigate", { detail: { to: "/database" } }),
          );
        }}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        Full page: <span className="font-mono text-foreground">/database</span>
      </p>
    </div>
  );
}
