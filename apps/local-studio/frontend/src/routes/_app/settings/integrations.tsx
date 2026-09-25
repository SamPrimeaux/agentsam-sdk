import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { IntegrationsPage } from "../../../../../packages/agentsam-key-manager/src/pages/IntegrationsPage.jsx";

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
        setConnections(
          list.map((c) => ({
            id: c.id || c.provider,
            provider: c.provider || c.id,
            label: c.label || c.provider || "Connection",
            status: c.status || (c.connected ? "active" : "invalid"),
            granted_scopes: c.granted_scopes || c.scopes || [],
            account_name: c.account_name || c.accountName || undefined,
          })),
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
