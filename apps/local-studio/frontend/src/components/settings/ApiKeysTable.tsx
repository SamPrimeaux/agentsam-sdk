import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  accountInventoryRequest,
  vaultRequest,
  type AccountInventoryPayload,
} from "@/lib/vault/client";
import type { VaultSecret } from "./types";

const SERVICE_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  google: "Gemini",
  xai: "xAI / Grok",
  grok: "xAI / Grok",
  cursor: "Cursor",
  cloudflare: "Cloudflare",
  meshy: "Meshy",
  resend: "Resend",
  tavily: "Tavily",
  github: "GitHub",
  other: "Other",
};

const MODEL_PROVIDER_IDS = new Set(["openai", "anthropic", "gemini", "xai", "cursor", "cloudflare"]);

function canonicalProvider(service: string): string {
  const id = String(service || "").trim().toLowerCase();
  if (id === "google") return "gemini";
  if (id === "grok") return "xai";
  return id;
}

function providerStatus(
  service: string,
  inventory: AccountInventoryPayload | null,
  selected: boolean,
): string {
  const provider = canonicalProvider(service);
  if (!MODEL_PROVIDER_IDS.has(provider)) return "Not checked";
  if (!selected) return "Not selected";
  if (!inventory) return "Not checked";
  const discovery = inventory.discovery?.[provider];
  if (discovery?.ok === true) {
    const count = (inventory.availableModels || []).filter((model) => model.provider === provider).length;
    return `Connected · ${count} model${count === 1 ? "" : "s"}`;
  }
  if (discovery?.error === "provider_credential_rejected") {
    return `${SERVICE_LABELS[provider] || provider} rejected this key`;
  }
  return "Not checked";
}

function formatUnixDate(epoch: number | string | null | undefined) {
  if (epoch == null || epoch === "") return "—";
  const seconds = typeof epoch === "number" ? epoch : Number(epoch);
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const ms = seconds < 1e12 ? seconds * 1000 : seconds;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  } catch {
    return "—";
  }
}

export function ApiKeysTable({ refreshToken = 0 }: { refreshToken?: number }) {
  const [secrets, setSecrets] = useState<VaultSecret[]>([]);
  const [inventory, setInventory] = useState<AccountInventoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await vaultRequest<{ error?: string; secrets?: VaultSecret[] }>("/api/vault/secrets");
      if (!response.ok) throw new Error(response.data.error || `Could not load secrets (${response.status})`);
      setSecrets(Array.isArray(response.data.secrets) ? response.data.secrets : []);
      try {
        const inventoryResponse = await accountInventoryRequest();
        setInventory(inventoryResponse.ok && inventoryResponse.data.ok !== false ? inventoryResponse.data : null);
      } catch {
        setInventory(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load secrets");
      setInventory(null);
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
      const response = await vaultRequest<{ error?: string }>(
        `/api/vault/secrets/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error(response.data.error || "Could not revoke secret");
      setConfirmId(null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke secret");
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-2xl bg-card shadow-hairline">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading secrets" />
      </div>
    );
  }

  const selectedProviders = new Set<string>();

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
          <h2 className="mt-4 text-base font-medium text-foreground">No secrets yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a provider key or token. Names are free-form; storage is account-scoped.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-hairline">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)_9rem_8rem] gap-4 border-b border-border px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
            <span>Name</span>
            <span>Service</span>
            <span>Secret</span>
            <span>Updated</span>
            <span className="text-right">Action</span>
          </div>
          <ul className="divide-y divide-border">
            {secrets.map((secret) => {
              const providerId = canonicalProvider(secret.service);
              const selected = !selectedProviders.has(providerId);
              if (MODEL_PROVIDER_IDS.has(providerId) && selected) selectedProviders.add(providerId);
              const service = SERVICE_LABELS[String(secret.service || "").toLowerCase()]
                || SERVICE_LABELS[providerId]
                || secret.service
                || "—";
              const status = providerStatus(secret.service, inventory, selected);
              const confirming = confirmId === secret.id;
              return (
                <li
                  key={secret.id}
                  className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,1fr)_9rem_8rem] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-accent">
                      <ShieldCheck className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{secret.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{service}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{status}</p>
                    </div>
                  </div>
                  <div className="hidden min-w-0 md:block">
                    <p className="text-sm text-muted-foreground">{service}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{status}</p>
                  </div>
                  <p className="font-mono text-sm text-muted-foreground">
                    {secret.last4 ? `•••• ${secret.last4}` : "Encrypted"}
                  </p>
                  <p className="text-sm text-muted-foreground">{formatUnixDate(secret.updated_at)}</p>
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
                      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmId(secret.id)}>
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
