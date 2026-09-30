import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  IntegrationsPage,
  type IntegrationConnection,
} from "@inneranimalmedia/agentsam-key-manager/IntegrationsPage";
import {
  LocalStudioConnectionError,
  disconnectLocalStudioProvider,
  listLocalStudioConnections,
  startLocalStudioProviderConnection,
  type LocalStudioConnectionRecord,
} from "@/lib/connections/client";

export const Route = createFileRoute("/(apps)/settings/integrations")({
  component: IntegrationsSettingsPage,
});

function normalizeConnection(record: LocalStudioConnectionRecord): IntegrationConnection {
  const raw = String(record.status || "").toLowerCase();
  const connected = raw === "connected" || raw === "active" || record.connected === true;
  return {
    id: String(record.id || record.connection?.connectionId || record.provider || "unknown"),
    provider: String(record.provider || record.id || "unknown"),
    label: String(record.label || record.display_name || record.provider || "Connection"),
    status: connected ? "connected" : raw || "not_configured",
    granted_scopes:
      record.granted_scopes ||
      record.scopes ||
      record.connection?.scopes ||
      [],
    account_name:
      record.account_name ||
      record.accountName ||
      record.connection?.cloudflareAccountId ||
      undefined,
  };
}

function IntegrationsSettingsPage() {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const data = await listLocalStudioConnections();
      const list = Array.isArray(data.connections)
        ? data.connections
        : Array.isArray(data.items)
          ? data.items
          : [];

      // This surface is resource OAuth only. BYOK credentials remain in Keys & Secrets.
      setConnections(
        list
          .filter((record) => record?.kind === "oauth" || record?.provider === "cloudflare")
          .map(normalizeConnection),
      );
    } catch (caught) {
      const status =
        caught instanceof LocalStudioConnectionError ? caught.status : null;
      setConnections([]);
      setErrorStatus(status);
      setError(caught instanceof Error ? caught.message : String(caught || "Connection request failed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 text-sm text-muted-foreground sm:p-6 lg:p-8">
        Loading integrations…
      </div>
    );
  }

  if (errorStatus === 401) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 text-foreground sm:p-6 lg:p-8">
        <div>
          <h1 className="m-0 text-xl font-semibold">Integrations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to Local Studio before viewing or changing provider connections.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="m-0 text-sm text-muted-foreground">
            Your Local Studio user session identifies whose provider grants may be loaded. Provider authorization stays separate.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
              onClick={() => window.dispatchEvent(new CustomEvent("agentsam:identity-open"))}
            >
              Sign in
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 text-foreground sm:p-6 lg:p-8">
      {error ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span>{error}</span>
          <button type="button" className="underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      <IntegrationsPage
        connections={connections}
        onConnect={(provider) => {
          void startLocalStudioProviderConnection(provider, {
            returnTo: "/settings/integrations",
          }).catch((caught) => {
            if (caught instanceof LocalStudioConnectionError && caught.status === 401) {
              window.dispatchEvent(new CustomEvent("agentsam:identity-open"));
              return;
            }
            setError(caught instanceof Error ? caught.message : String(caught));
          });
        }}
        onDisconnect={(id) => {
          const provider =
            connections.find((connection) => connection.id === id)?.provider || id;
          void disconnectLocalStudioProvider(provider)
            .then(() => load())
            .catch((caught) => {
              if (caught instanceof LocalStudioConnectionError && caught.status === 401) {
                window.dispatchEvent(new CustomEvent("agentsam:identity-open"));
                return;
              }
              setError(caught instanceof Error ? caught.message : String(caught));
            });
        }}
      />
    </div>
  );
}
