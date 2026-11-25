/**
 * Account-owned model-picker visibility preferences.
 *
 * Provider availability is discovered live for each credential. This module
 * stores only hidden model IDs in the existing agentsam_user_ui_preferences
 * row; it does not create a second model catalog or per-provider model table.
 */
import type { VaultD1Binding } from "./studio-vault.ts";

type ModelPreferenceEnv = { DB?: VaultD1Binding | null };
type ModelPreferenceInput = {
  credentialId?: unknown;
  provider?: unknown;
  modelId?: unknown;
  visible?: unknown;
};
type CredentialPreference = { provider?: string; hidden_model_ids?: unknown };
type ModelInventoryRow = Record<string, unknown>;
type ModelInventory = {
  credentialModels?: ModelInventoryRow[];
  availableModels?: ModelInventoryRow[];
  [key: string]: unknown;
};

function decode(value: unknown): Record<string, unknown> {
  try {
    const object = JSON.parse(String(value || "{}"));
    return object && typeof object === "object" && !Array.isArray(object) ? object : {};
  } catch {
    return {};
  }
}

export async function getStudioModelVisibilityPreferences(
  env: ModelPreferenceEnv,
  accountId: string,
): Promise<Record<string, CredentialPreference>> {
  if (!accountId || !env.DB?.prepare) return {};
  const row = await env.DB.prepare(
    "SELECT ui_preferences_json FROM agentsam_user_ui_preferences WHERE account_id = ? LIMIT 1",
  ).bind(accountId).first<{ ui_preferences_json?: string }>();
  const root = decode(row?.ui_preferences_json);
  const inventory = root.model_inventory;
  const byCredential = inventory && typeof inventory === "object" && !Array.isArray(inventory)
    ? (inventory as Record<string, unknown>).by_credential
    : null;
  return byCredential && typeof byCredential === "object" && !Array.isArray(byCredential)
    ? byCredential as Record<string, CredentialPreference>
    : {};
}

export async function setStudioModelVisibilityPreference(
  env: ModelPreferenceEnv,
  accountId: string,
  input: ModelPreferenceInput,
) {
  if (!accountId || !env.DB?.prepare) throw new Error("model_preferences_unavailable");
  const credentialId = String(input.credentialId || "").trim();
  const provider = String(input.provider || "").trim().toLowerCase();
  const modelId = String(input.modelId || "").trim();
  const visible = input.visible;
  if (!credentialId || credentialId.length > 256 || !provider || provider.length > 128
      || !modelId || modelId.length > 512 || typeof visible !== "boolean") {
    throw new TypeError("model_preference_invalid");
  }

  const row = await env.DB.prepare(
    "SELECT ui_preferences_json FROM agentsam_user_ui_preferences WHERE account_id = ? LIMIT 1",
  ).bind(accountId).first<{ ui_preferences_json?: string }>();
  const root = decode(row?.ui_preferences_json);
  const currentInventory = root.model_inventory && typeof root.model_inventory === "object"
    && !Array.isArray(root.model_inventory) ? root.model_inventory as Record<string, unknown> : {};
  const currentByCredential = currentInventory.by_credential && typeof currentInventory.by_credential === "object"
    && !Array.isArray(currentInventory.by_credential)
    ? currentInventory.by_credential as Record<string, CredentialPreference>
    : {};
  const previous = currentByCredential[credentialId] || {};
  const hidden = new Set(Array.isArray(previous.hidden_model_ids)
    ? previous.hidden_model_ids.map(String)
    : []);
  if (visible) hidden.delete(modelId);
  else hidden.add(modelId);

  const byCredential = { ...currentByCredential };
  if (hidden.size) byCredential[credentialId] = { provider, hidden_model_ids: [...hidden].sort() };
  else delete byCredential[credentialId];

  const next = {
    ...root,
    model_inventory: { ...currentInventory, by_credential: byCredential },
  };
  await env.DB.prepare(
    "INSERT INTO agentsam_user_ui_preferences (account_id, ui_preferences_json, updated_at) "
      + "VALUES (?, ?, unixepoch()) ON CONFLICT(account_id) DO UPDATE SET "
      + "ui_preferences_json = excluded.ui_preferences_json, updated_at = unixepoch()",
  ).bind(accountId, JSON.stringify(next)).run();
  return { credential_id: credentialId, provider, model_id: modelId, visible };
}

export async function applyAccountModelVisibilityPreferences(
  env: ModelPreferenceEnv,
  accountId: string,
  inventory: ModelInventory,
): Promise<ModelInventory> {
  const byCredential = await getStudioModelVisibilityPreferences(env, accountId);
  const credentialModels: ModelInventoryRow[] = (Array.isArray(inventory.credentialModels) ? inventory.credentialModels : []).map((model): ModelInventoryRow => {
    const credentialId = String(model.credential_id || "");
    const modelId = String(model.model_id || model.provider_model_id || "");
    const preferences = byCredential[credentialId];
    const hidden = new Set(Array.isArray(preferences?.hidden_model_ids)
      ? preferences.hidden_model_ids.map(String)
      : []);
    return { ...model, visible: !hidden.has(modelId) };
  });

  // One provider/model remains runnable if any credential exposing it is visible.
  const availableByKey = new Map<string, ModelInventoryRow>();
  for (const model of credentialModels) {
    if (model.visible === false) continue;
    if (model.availability_status && model.availability_status !== "available") continue;
    if (model.availability && !["available", "binding_configured"].includes(String(model.availability))) continue;
    const key = String(model.provider || "") + ":" + String(model.model_id || model.provider_model_id || "");
    if (!key.endsWith(":") && !availableByKey.has(key)) availableByKey.set(key, model);
  }
  return { ...inventory, credentialModels, availableModels: [...availableByKey.values()] };
}
