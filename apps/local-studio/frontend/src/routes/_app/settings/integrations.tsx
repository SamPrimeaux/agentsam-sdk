import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "@inneranimalmedia/agentsam-key-manager/IntegrationsPage";

export const Route = createFileRoute("/_app/settings/integrations")({
  component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connections", { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const list = Array.isArray(data.connections)
          ? data.connections
          : Array.isArray(data.items)
            ? data.items
            : [];
        // IntegrationsPage is OAuth-only — BYOK keys belong on Keys & Secrets.
        const oauthOnly = list.filter((c) => c?.kind === "oauth" || c?.provider === "cloudflare");
        setConnections(
          oauthOnly.map((c) => {
            const raw = String(c.status || "").toLowerCase();
            const connected = raw === "connected" || raw === "active" || c.connected === true;
            return {
              id: c.id || c.connection?.connectionId || c.provider,
              provider: c.provider || c.id,
              label: c.label || c.display_name || c.provider || "Connection",
              status: connected ? "connected" : raw || "not_configured",
              granted_scopes:
                c.granted_scopes ||
                c.scopes ||
                c.connection?.scopes ||
                [],
              account_name:
                c.account_name ||
                c.accountName ||
                c.connection?.cloudflareAccountId ||
                undefined,
            };
          }),
        );
      } catch {
        /* empty until connected */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6 lg:p-8 text-foreground">
      <IntegrationsPage
        connections={connections}
        onConnect={(provider) => {
          window.location.href = `/api/connections/${encodeURIComponent(provider)}/start`;
        }}
        onDisconnect={(id) => {
          void fetch(`/api/connections/${encodeURIComponent(id)}/disconnect`, {
            method: "POST",
            credentials: "same-origin",
          }).then(() => window.location.reload());
        }}
      />
    </div>
  );
}
