import { useMemo, useState } from "react";
import { Database } from "lucide-react";
import { InstallableEmptyState } from "@/components/database/InstallableEmptyState";
import { resolveWebIcon } from "@/lib/icons/web-icon-registry";
import { DATABASE_EDITOR_APP } from "@inneranimalmedia/agentsam-database-editor/manifest";

type ConnectionDraft = {
  id: string;
  label: string;
  path: string;
  engine: "sqlite";
  provider: "local";
  vectors: { driver: "none" };
};

export function DatabasePage() {
  const [connections, setConnections] = useState<ConnectionDraft[]>([]);
  const [pathDraft, setPathDraft] = useState(".agentsam/local.sqlite");
  const Icon = resolveWebIcon(DATABASE_EDITOR_APP.icon || "database");

  const empty = connections.length === 0;

  const primary = useMemo(
    () => ({
      label: DATABASE_EDITOR_APP.empty_state?.primary_label || "Open local database",
      onClick: () => {
        const path = pathDraft.trim() || ".agentsam/local.sqlite";
        setConnections((prev) => [
          ...prev,
          {
            id: `sqlite:local:${path}`,
            label: path.split("/").pop() || "local.sqlite",
            path,
            engine: "sqlite" as const,
            provider: "local" as const,
            vectors: { driver: "none" as const },
          },
        ]);
      },
    }),
    [pathDraft],
  );

  if (empty) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-3">
          <Database className="size-4 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Database
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Local SQLite · vectors optional (none by default)
            </p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto flex max-w-xl flex-col gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Local SQLite path</span>
              <input
                className="h-11 rounded-lg border border-border bg-background px-3 font-mono text-sm"
                value={pathDraft}
                onChange={(e) => setPathDraft(e.target.value)}
                placeholder=".agentsam/local.sqlite"
                spellCheck={false}
              />
            </label>
            <InstallableEmptyState
              installable={DATABASE_EDITOR_APP}
              icon={<Icon className="size-8" aria-hidden />}
              onInstall={primary.onClick}
              onPreview={() => {
                window.dispatchEvent(
                  new CustomEvent("agentsam:navigate", { detail: { to: "/database" } }),
                );
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Database
          </p>
          <p className="truncate text-xs text-foreground">
            {connections[0]?.label} · {connections[0]?.engine} · {connections[0]?.provider} ·
            vectors none
          </p>
        </div>
        <button
          type="button"
          className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-muted"
          onClick={() => setConnections([])}
        >
          Disconnect
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto grid max-w-3xl gap-4">
          <section className="rounded-xl border border-border p-4">
            <h2 className="text-sm font-medium">Connection</h2>
            <dl className="mt-3 grid gap-2 font-mono text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt>engine</dt>
                <dd className="text-foreground">{connections[0]?.engine}</dd>
              </div>
              <div>
                <dt>provider</dt>
                <dd className="text-foreground">{connections[0]?.provider}</dd>
              </div>
              <div>
                <dt>path</dt>
                <dd className="text-foreground">{connections[0]?.path}</dd>
              </div>
              <div>
                <dt>vectors</dt>
                <dd className="text-foreground">none</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted-foreground">
              Schema browser, SQL, and metrics adapters land next. Local open path is ready —
              Cloudflare GraphQL analytics stay behind the metrics adapter scaffold.
            </p>
          </section>
          <button
            type="button"
            className="h-11 w-fit rounded-lg bg-foreground px-4 text-sm font-medium text-background"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("agentsam:open-side-tab", { detail: { kind: "database" } }),
              )
            }
          >
            Open in workbench
          </button>
        </div>
      </div>
    </div>
  );
}
