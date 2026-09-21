import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VaultSecret } from "./types";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  xai: "xAI",
  grok: "xAI",
  cursor: "Cursor",
  cloudflare: "Cloudflare",
};

function formatDate(epoch: number | null | undefined) {
  if (!epoch) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(epoch * 1000));
}

export function ApiKeysTable({ refreshToken = 0 }: { refreshToken?: number }) {
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vault/secrets", { credentials: "same-origin" });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        secrets?: VaultSecret[];
      };
      if (!response.ok) throw new Error(data.error || `Could not load keys (${response.status})`);
      setSecrets(Array.isArray(data.secrets) ? data.secrets : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      const response = await fetch(`/api/vault/secrets/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not revoke key");
      setConfirmId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke key");
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-2xl bg-card shadow-hairline">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading API keys" />
      </div>
    );
  }

  return (
    <div>
      {error ? (
        <div role="alert" className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {secrets.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-hairline">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-accent shadow-hairline">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-medium text-foreground">No API keys yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a provider key to make it available to your Local Studio runtime.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-hairline">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_8rem] gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Provider</span>
            <span>Key</span>
            <span>Updated</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-border">
            {secrets.map((secret) => {
              const confirming = confirmId === secret.id;
              const provider = PROVIDER_LABELS[secret.service.toLowerCase()] || secret.service;
              return (
                <li
                  key={secret.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_8rem] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-accent">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{provider}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Configured</p>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{secret.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {secret.last4 ? `•••• ${secret.last4}` : "Encrypted value"}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">{formatDate(secret.updated_at)}</p>
                  <div className="flex flex-wrap justify-start gap-1 md:justify-end">
                    {confirming ? (
                      <>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={revoking === secret.id}
                          onClick={() => void revoke(secret.id)}
                        >
                          {revoking === secret.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          Confirm
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmId(secret.id)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
