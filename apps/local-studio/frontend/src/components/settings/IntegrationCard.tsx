import { ArrowRight, Cloud, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OAuthConnectionRecord } from "./types";

export function IntegrationCard({
  connection,
  busy,
  onOpen,
  onConnect,
}: {
  connection: OAuthConnectionRecord;
  busy: boolean;
  onOpen: () => void;
  onConnect: () => void;
}) {
  const connected = connection.status === "connected";
  const health = connection.plugin?.health_status || "unknown";

  return (
    <article className="group flex min-h-52 flex-col rounded-2xl bg-card p-5 shadow-hairline transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-accent)_32%,transparent)]">
      <button
        type="button"
        className="flex flex-1 flex-col text-left"
        onClick={onOpen}
        aria-label="Open AgentSam MCP connection details"
      >
        <div className="flex w-full items-start justify-between gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-accent shadow-hairline">
            <Cloud className="size-5" aria-hidden="true" />
          </span>
          <span
            className={
              connected
                ? "inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent"
                : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
            }
          >
            {connected ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : null}
            {connected ? "Connected" : "Available"}
          </span>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-medium tracking-tight text-foreground">AgentSam MCP</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Connect a Cloudflare account through AgentSam’s centralized OAuth approval flow.
          </p>
        </div>
      </button>

      <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">
          {connected
            ? health === "healthy" ? "Live probe healthy" : `Health ${health.replaceAll("_", " ")}`
            : "OAuth with PKCE"}
        </span>
        {connected ? (
          <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
            Manage
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={busy || !connection.available}
            onClick={onConnect}
          >
            {busy ? "Opening…" : connection.available ? "Connect" : "Unavailable"}
          </Button>
        )}
      </div>
    </article>
  );
}
