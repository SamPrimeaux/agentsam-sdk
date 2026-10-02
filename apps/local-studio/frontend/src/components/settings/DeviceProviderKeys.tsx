import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/input";
import {
  identitySessionExists,
  invokeLocalProvider,
  providerKeyDelete,
  providerKeySet,
  providerKeyStatus,
  providerKeySyncFromAccount,
  providerKeySyncToAccount,
  type ProviderKeyStatus,
} from "@/lib/desktop/tauri";
import { vaultRequest } from "@/lib/vault/client";
import { canonicalProviderId, planProviderSync } from "@/lib/vault/device-sync";
import type { StudioInventoryModel } from "@/lib/work/models";
import type { VaultSecret } from "./types";

const DEVICE_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Gemini" },
  { id: "cursor", label: "Cursor" },
  { id: "xai", label: "xAI / Grok" },
] as const;

type DeviceProviderId = (typeof DEVICE_PROVIDERS)[number]["id"];
type InventoryPayload = {
  availableModels?: StudioInventoryModel[];
  discovery?: Record<string, { ok?: boolean; error?: string | null }>;
};
type ProviderState = {
  exists: boolean;
  accountExists: boolean;
  synced: boolean;
  checking: boolean;
  message: string | null;
  rejected: boolean;
};

const EMPTY_STATE: ProviderState = {
  exists: false,
  accountExists: false,
  synced: false,
  checking: false,
  message: null,
  rejected: false,
};

function accountSecretsByProvider(secrets: VaultSecret[]): Map<DeviceProviderId, VaultSecret> {
  const supported = new Set<DeviceProviderId>(DEVICE_PROVIDERS.map((provider) => provider.id));
  const map = new Map<DeviceProviderId, VaultSecret>();
  for (const secret of secrets) {
    const provider = canonicalProviderId(secret.service) as DeviceProviderId;
    if (supported.has(provider) && !map.has(provider)) map.set(provider, secret);
  }
  return map;
}

function keyIsSynced(local: ProviderKeyStatus, account: VaultSecret | null): boolean {
  if (!account || !local.exists || local.synced_secret_id !== account.id) return false;
  return !(account.last4 && local.last4 && account.last4 !== local.last4);
}

export function DeviceProviderKeys({
  refreshToken = 0,
  onAccountChanged,
}: {
  refreshToken?: number;
  onAccountChanged?: () => void;
}) {
  const [rows, setRows] = useState<Record<DeviceProviderId, ProviderState>>(() =>
    Object.fromEntries(DEVICE_PROVIDERS.map(({ id }) => [id, { ...EMPTY_STATE }])) as Record<
      DeviceProviderId,
      ProviderState
    >,
  );
  const [drafts, setDrafts] = useState<Record<DeviceProviderId, string>>(() =>
    Object.fromEntries(DEVICE_PROVIDERS.map(({ id }) => [id, ""])) as Record<DeviceProviderId, string>,
  );
  const [signedIn, setSignedIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const connected = await identitySessionExists().catch(() => false);
      setSignedIn(connected);

      let accountReady = false;
      let account = new Map<DeviceProviderId, VaultSecret>();
      if (connected) {
        try {
          const response = await vaultRequest<{ secrets?: VaultSecret[] }>("/api/vault/secrets");
          if (response.ok) {
            accountReady = true;
            account = accountSecretsByProvider(response.data.secrets || []);
          }
        } catch {
          accountReady = false;
        }
      }

      const local = new Map<DeviceProviderId, ProviderKeyStatus>();
      const syncErrors = new Set<DeviceProviderId>();

      for (const { id } of DEVICE_PROVIDERS) {
        let status = await providerKeyStatus(id);
        let accountSecret = account.get(id) || null;

        if (connected && accountReady) {
          try {
            const action = planProviderSync(
              status,
              accountSecret ? { id: accountSecret.id, last4: accountSecret.last4 } : null,
            );
            if (action === "pull" && accountSecret) {
              await providerKeySyncFromAccount(id, accountSecret.id);
              status = await providerKeyStatus(id);
            } else if (action === "push") {
              const pushed = await providerKeySyncToAccount(id);
              status = await providerKeyStatus(id);
              accountSecret = {
                id: pushed.secret_id,
                vault_item_id: pushed.secret_id,
                name: "AgentSam synced",
                type: "api_key",
                service: id,
                description: "Synchronized with AgentSam Local Studio",
                expires_at: null,
                last_used_at: null,
                usage_count: 0,
                created_at: Date.now() / 1000,
                updated_at: Date.now() / 1000,
                last4: pushed.last4,
              };
              account.set(id, accountSecret);
              onAccountChanged?.();
            } else if (action === "delete_local") {
              await providerKeyDelete(id);
              status = await providerKeyStatus(id);
            }
          } catch {
            syncErrors.add(id);
          }
        }

        local.set(id, status);
      }

      let inventory: InventoryPayload | null = null;
      if ([...local.values()].some((status) => status.exists)) {
        try {
          inventory = await invokeLocalProvider<InventoryPayload>({ operation: "inventory" });
        } catch {
          inventory = null;
        }
      }

      setRows(
        Object.fromEntries(
          DEVICE_PROVIDERS.map(({ id, label }) => {
            const status = local.get(id) || {
              exists: false,
              last4: null,
              synced_secret_id: null,
              synced_last4: null,
            };
            const accountSecret = account.get(id) || null;
            const discovery = inventory?.discovery?.[id];
            const count = (inventory?.availableModels || []).filter((model) => model.provider === id).length;
            const rejected = discovery?.error === "provider_credential_rejected";
            const synced = connected && accountReady && keyIsSynced(status, accountSecret);

            let message = connected ? "Not configured" : "Not stored on this device";
            if (rejected) message = `${label} rejected this key`;
            else if (syncErrors.has(id)) {
              message = status.exists
                ? "Saved on this device · Account sync needs retry"
                : "Saved in account · Device sync needs retry";
            } else if (synced) {
              message = discovery?.ok
                ? `Synced with account · ${count} model${count === 1 ? "" : "s"}`
                : "Synced with account";
            } else if (status.exists && connected && !accountReady) {
              message = "Saved on this device · Account vault unavailable";
            } else if (status.exists && connected) {
              message = "Saved on this device · Sync pending";
            } else if (status.exists) {
              message = discovery?.ok
                ? `Stored on this device · ${count} model${count === 1 ? "" : "s"}`
                : "Stored on this device";
            } else if (accountSecret && connected) {
              message = "Saved in account · Device sync pending";
            }

            return [
              id,
              {
                exists: status.exists,
                accountExists: Boolean(accountSecret),
                synced,
                checking: false,
                message,
                rejected,
              },
            ];
          }),
        ) as Record<DeviceProviderId, ProviderState>,
      );
    } finally {
      setRefreshing(false);
    }
  }, [onAccountChanged]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  async function save(provider: DeviceProviderId) {
    const value = drafts[provider].trim();
    if (!value) return;

    setRows((current) => ({
      ...current,
      [provider]: { ...current[provider], checking: true, message: null, rejected: false },
    }));

    try {
      await providerKeySet(provider, value);
      const inventory = await invokeLocalProvider<InventoryPayload>({ operation: "inventory" });
      if (inventory.discovery?.[provider]?.error === "provider_credential_rejected") {
        await providerKeyDelete(provider);
        setDrafts((current) => ({ ...current, [provider]: "" }));
        setRows((current) => ({
          ...current,
          [provider]: {
            ...EMPTY_STATE,
            rejected: true,
            message: `${DEVICE_PROVIDERS.find((row) => row.id === provider)?.label} rejected this key`,
          },
        }));
        return;
      }

      if (await identitySessionExists().catch(() => false)) {
        try {
          await providerKeySyncToAccount(provider);
          onAccountChanged?.();
        } catch {
          // A valid local key remains usable and will retry sync on refresh/focus.
        }
      }

      setDrafts((current) => ({ ...current, [provider]: "" }));
      await refresh();
    } catch {
      setDrafts((current) => ({ ...current, [provider]: "" }));
      setRows((current) => ({
        ...current,
        [provider]: { ...current[provider], checking: false, message: "Could not save or check this key" },
      }));
    }
  }

  async function removeLocal(provider: DeviceProviderId) {
    await providerKeyDelete(provider);
    setDrafts((current) => ({ ...current, [provider]: "" }));
    await refresh();
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-foreground">
            {signedIn ? "Synced provider keys" : "This device"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {signedIn
              ? "Your account vault is the signed-in authority. AgentSam keeps a matching native Keychain copy for local execution; plaintext never returns from Keychain to the UI."
              : "Local BYOK is stored only in the operating system credential store until you sign in. Raw keys never return to the app UI."}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={refreshing}
          onClick={() => void refresh()}
          className="gap-1.5"
        >
          <RefreshCw className={refreshing ? "size-3.5 animate-spin" : "size-3.5"} aria-hidden="true" />
          Sync
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-card shadow-hairline">
        {DEVICE_PROVIDERS.map(({ id, label }, index) => {
          const state = rows[id];
          return (
            <div
              key={id}
              className={index ? "border-t border-border px-4 py-4 sm:px-5" : "px-4 py-4 sm:px-5"}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium text-foreground">{label}</span>
                    {state.exists && !state.rejected ? (
                      <CheckCircle2
                        className="size-4 text-muted-foreground"
                        aria-label={state.synced ? "Synced with account" : "Stored on this device"}
                      />
                    ) : null}
                  </div>
                  <p
                    className={
                      state.rejected ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-muted-foreground"
                    }
                  >
                    {state.checking ? "Checking provider…" : state.message}
                  </p>
                </div>

                {state.exists ? (
                  !signedIn || !state.accountExists ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeLocal(id)}
                      className="gap-1.5"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Remove device copy
                    </Button>
                  ) : null
                ) : (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <SecretInput
                      value={drafts[id]}
                      onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
                      placeholder={`Paste ${label} key`}
                      className="h-9 min-w-0 font-mono sm:w-64"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={state.checking || drafts[id].trim().length < 8}
                      onClick={() => void save(id)}
                    >
                      {state.checking ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : "Save"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
