export type DeviceKeySyncState = {
  exists: boolean;
  last4: string | null;
  synced_secret_id: string | null;
  synced_last4: string | null;
};

export type AccountKeySyncState = {
  id: string;
  last4: string | null;
};

export type ProviderSyncAction = "none" | "pull" | "push" | "delete_local";

export function canonicalProviderId(service: string): string {
  const value = String(service || "").trim().toLowerCase();
  if (value === "google") return "gemini";
  if (value === "grok") return "xai";
  return value;
}

export function planProviderSync(
  local: DeviceKeySyncState,
  account: AccountKeySyncState | null,
): ProviderSyncAction {
  if (account) {
    if (!local.exists) return "pull";
    if (!local.synced_secret_id) return "pull";
    if (local.synced_secret_id !== account.id) return "pull";
    if (account.last4 && local.last4 && account.last4 !== local.last4) return "pull";
    return "none";
  }

  if (!local.exists) return "none";
  if (local.synced_secret_id) return "delete_local";
  return "push";
}
