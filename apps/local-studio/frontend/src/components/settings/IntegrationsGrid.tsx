import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IntegrationCard } from "./IntegrationCard";
import { IntegrationDrawer } from "./IntegrationDrawer";
import type { OAuthConnectionRecord } from "./types";

type RegistryResponse = {
  ok?: boolean;
  error?: string;
  connections?: Array<OAuthConnectionRecord | { kind: string; status: string }>;
};

async function readJson(response: Response) {
  return (await response.json().catch(() => ({}))) as RegistryResponse;
}

export function IntegrationsGrid() {
  const [connection, setConnection] = useState<OAuthConnectionRecord | null>(null);
  const [tab, setTab] = useState<"connected" | "available">("available");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/connections", { credentials: "same-origin" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || `Could not load connections (${response.status})`);
      const cloudflare = data.connections?.find(
        (item): item is OAuthConnectionRecord => item.kind === "oauth" && "provider" in item && item.provider === "cloudflare",
      );
      if (!cloudflare) throw new Error("Cloudflare connection status is unavailable");
      setConnection(cloudflare);
      setTab(cloudflare.status === "connected" ? "connected" : "available");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connection") !== "cloudflare") return;
    const result = params.get("result");
    if (result === "connected") toast.success("Cloudflare connected");
    if (result === "error") toast.error(params.get("error") || "Cloudflare connection failed");
    params.delete("connection");
    params.delete("result");
    params.delete("error");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);

  const connected = connection?.status === "connected";
  const visible = useMemo(() => {
    if (!connection) return [];
    if (tab === "connected") return connected ? [connection] : [];
    return connected ? [] : [connection];
  }, [connected, connection, tab]);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/connections/cloudflare/start", {
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as {
        authorize_url?: string;
        error?: string;
        message?: string;
      };
      if (!response.ok || !data.authorize_url) {
        throw new Error(data.message || data.error || "Could not start Cloudflare authorization");
      }
      window.location.assign(data.authorize_url);
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : "Could not start Cloudflare authorization");
    }
  }, []);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/connections/cloudflare/disconnect", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not disconnect Cloudflare");
      setDrawerOpen(false);
      toast.success("Cloudflare disconnected");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect Cloudflare");
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Settings</p>
          <h1 className="mt-2 font-display text-3xl tracking-tight text-foreground">Integrations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Connect provider accounts through OAuth. Each deployment keeps its own encrypted connection data.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="mt-8 flex gap-1 border-b border-border" role="tablist" aria-label="Connection status">
        {(["connected", "available"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "min-h-11 border-b-2 px-4 text-sm font-medium capitalize transition-colors duration-150",
              tab === id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {id}
            <span className="ml-2 tabular-nums text-xs text-muted-foreground">
              {id === "connected" ? (connected ? 1 : 0) : connected ? 0 : 1}
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <div role="alert" className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 flex min-h-52 items-center justify-center rounded-2xl bg-card shadow-hairline">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading integrations" />
        </div>
      ) : visible.length ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((item) => (
            <IntegrationCard
              key={`${item.provider}:${item.kind}`}
              connection={item}
              busy={busy}
              onOpen={() => setDrawerOpen(true)}
              onConnect={() => void connect()}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-card p-8 text-center shadow-hairline">
          <p className="text-base font-medium text-foreground">
            {tab === "connected" ? "No connected providers" : "All available providers are connected"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tab === "connected"
              ? "Open Available to connect Cloudflare."
              : "Manage Cloudflare from the Connected tab."}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setTab(tab === "connected" ? "available" : "connected")}
          >
            View {tab === "connected" ? "available" : "connected"}
          </Button>
        </div>
      )}

      <aside className="mt-8 flex flex-col gap-4 rounded-2xl bg-muted p-5 shadow-hairline sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-accent shadow-hairline">
            <KeyRound className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-medium text-foreground">Provider API keys</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              OpenAI, Anthropic, Gemini, xAI, Cursor, and Cloudflare tokens live in the same deployment vault.
            </p>
          </div>
        </div>
        <Button asChild type="button" variant="secondary" size="sm">
          <Link to="/settings/keys">Manage keys</Link>
        </Button>
      </aside>

      <IntegrationDrawer
        open={drawerOpen}
        connection={connection}
        busy={busy}
        onOpenChange={setDrawerOpen}
        onConnect={() => void connect()}
        onDisconnect={disconnect}
      />
    </div>
  );
}
