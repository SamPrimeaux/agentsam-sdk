import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type StudioMintedCredential = {
  id: string;
  name: string;
  kind: "account" | "service";
  env: string;
  prefix: string;
  status: string;
  created_at_unix: number;
  expires_at_unix: number | null;
  last_used_at_unix: number | null;
  secret_preview: string;
};

function formatDate(epoch: number | null | undefined) {
  if (!epoch) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(epoch * 1000));
}

export function CredentialsTable({ refreshToken = 0 }: { refreshToken?: number }) {
  const [rows, setRows] = useState<StudioMintedCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/vault/credentials", { credentials: "same-origin" });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        credentials?: StudioMintedCredential[];
      };
      if (!response.ok) throw new Error(data.error || `Could not load credentials (${response.status})`);
      setRows(Array.isArray(data.credentials) ? data.credentials : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load credentials");
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
      const response = await fetch(`/api/vault/credentials/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!response.ok || data.ok === false) throw new Error(data.error || "Could not revoke");
      setConfirmId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke");
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-2xl bg-card shadow-hairline">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading credentials" />
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

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center shadow-hairline">
          <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted text-accent shadow-hairline">
            <KeyRound className="size-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-medium text-foreground">No AgentSam keys yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Mint an account API key (aak_*) or service bridge key (brk_*). Hash stored; plaintext once.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-hairline">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_7rem_minmax(0,1fr)_minmax(0,1fr)_9rem_8rem] gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Name</span>
            <span>Type</span>
            <span>Env</span>
            <span>Secret</span>
            <span>Created</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const confirming = confirmId === row.id;
              return (
                <li
                  key={row.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_7rem_minmax(0,1fr)_minmax(0,1fr)_9rem_8rem] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-accent">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">{row.status}</p>
                    </div>
                  </div>
                  <p className="text-sm capitalize text-muted-foreground">{row.kind}</p>
                  <p className="font-mono text-xs text-muted-foreground">{row.env}</p>
                  <p className="font-mono text-sm text-muted-foreground">{row.secret_preview || row.prefix}</p>
                  <p className="text-sm text-muted-foreground">{formatDate(row.created_at_unix)}</p>
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
                          disabled={revoking === row.id}
                          onClick={() => void revoke(row.id)}
                        >
                          {revoking === row.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                          Confirm
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={row.status === "revoked"}
                        onClick={() => setConfirmId(row.id)}
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
