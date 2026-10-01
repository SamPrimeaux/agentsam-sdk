import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  invokeLocalProvider,
  providerKeyDelete,
  providerKeyExists,
  providerKeySet,
} from "@/lib/desktop/tauri";
import type { StudioInventoryModel } from "@/lib/work/models";

const DEVICE_PROVIDERS = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "gemini", label: "Gemini" },
  { id: "cursor", label: "Cursor" },
  { id: "xai", label: "xAI / Grok" },
] as const;

type DeviceProviderId = (typeof DEVICE_PROVIDERS)[number]["id"];
type InventoryPayload = {
  ok?: boolean;
  availableModels?: StudioInventoryModel[];
  discovery?: Record<string, { ok?: boolean; error?: string | null; returnedModelCount?: number }>;
};
type ProviderState = {
  exists: boolean;
  checking: boolean;
  modelCount: number | null;
  message: string | null;
  rejected: boolean;
};

const INITIAL: ProviderState = {
  exists: false,
  checking: false,
  modelCount: null,
  message: null,
  rejected: false,
};

export function DeviceProviderKeys() {
  const [rows, setRows] = useState<Record<DeviceProviderId, ProviderState>>(() =>
    Object.fromEntries(DEVICE_PROVIDERS.map(({ id }) => [id, { ...INITIAL }])) as Record<DeviceProviderId, ProviderState>,
  );
  const [drafts, setDrafts] = useState<Record<DeviceProviderId, string>>(() =>
    Object.fromEntries(DEVICE_PROVIDERS.map(({ id }) => [id, ""])) as Record<DeviceProviderId, string>,
  );

  const refresh = useCallback(async () => {
    const existing = Object.fromEntries(
      await Promise.all(DEVICE_PROVIDERS.map(async ({ id }) => [id, await providerKeyExists(id)] as const)),
    ) as Record<DeviceProviderId, boolean>;
    setRows((current) =>
      Object.fromEntries(
        DEVICE_PROVIDERS.map(({ id }) => [id, { ...current[id], exists: existing[id] }]),
      ) as Record<DeviceProviderId, ProviderState>,
    );
    if (!Object.values(existing).some(Boolean)) return;

    try {
      const inventory = await invokeLocalProvider<InventoryPayload>({ operation: "inventory" });
      setRows((current) => {
        const next = { ...current };
        for (const { id } of DEVICE_PROVIDERS) {
          if (!existing[id]) continue;
          const discovery = inventory.discovery?.[id];
          const count = (inventory.availableModels || []).filter((model) => model.provider === id).length;
          next[id] = {
            ...next[id],
            exists: true,
            checking: false,
            modelCount: discovery?.ok ? count : null,
            rejected: discovery?.error === "provider_credential_rejected",
            message:
              discovery?.error === "provider_credential_rejected"
                ? `${DEVICE_PROVIDERS.find((provider) => provider.id === id)?.label} rejected this key`
                : discovery?.ok
                  ? `Connected · ${count} models`
                  : "Saved on this device · Not checked",
          };
        }
        return next;
      });
    } catch {
      setRows((current) =>
        Object.fromEntries(
          DEVICE_PROVIDERS.map(({ id }) => [
            id,
            existing[id]
              ? { ...current[id], checking: false, message: "Saved on this device · Not checked" }
              : current[id],
          ]),
        ) as Record<DeviceProviderId, ProviderState>,
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
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
      // The plaintext leaves React state immediately after native Keychain persistence.
      setDrafts((current) => ({ ...current, [provider]: "" }));
      await refresh();
      const inventory = await invokeLocalProvider<InventoryPayload>({ operation: "inventory" });
      const discovery = inventory.discovery?.[provider];
      if (discovery?.error === "provider_credential_rejected") {
        await providerKeyDelete(provider);
        setRows((current) => ({
          ...current,
          [provider]: {
            ...INITIAL,
            rejected: true,
            message: `${DEVICE_PROVIDERS.find((row) => row.id === provider)?.label} rejected this key`,
          },
        }));
      } else {
        await refresh();
      }
    } catch {
      setDrafts((current) => ({ ...current, [provider]: "" }));
      setRows((current) => ({
        ...current,
        [provider]: { ...current[provider], checking: false, message: "Could not save or check this key" },
      }));
    }
  }

  async function remove(provider: DeviceProviderId) {
    await providerKeyDelete(provider);
    setDrafts((current) => ({ ...current, [provider]: "" }));
    setRows((current) => ({ ...current, [provider]: { ...INITIAL } }));
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-medium text-foreground">This device</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional local BYOK stored in the operating system credential store. Raw keys never return to the app UI.
        </p>
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
                      <CheckCircle2 className="size-4 text-muted-foreground" aria-label="Stored on this device" />
                    ) : null}
                  </div>
                  <p className={state.rejected ? "mt-1 text-xs text-destructive" : "mt-1 text-xs text-muted-foreground"}>
                    {state.checking
                      ? "Checking provider…"
                      : state.message || (state.exists ? "Stored on this device" : "Not stored on this device")}
                  </p>
                </div>
                {state.exists ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void remove(id)} className="gap-1.5">
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Remove
                  </Button>
                ) : (
                  <div className="flex w-full gap-2 sm:w-auto">
                    <Input
                      type="password"
                      value={drafts[id]}
                      onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
                      placeholder={`Paste ${label} key`}
                      autoComplete="off"
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
