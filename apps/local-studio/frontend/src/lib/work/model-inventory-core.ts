import type { StudioInventoryModel, StudioModelSelection } from "./models";

export type StudioInventoryProvider = {
  id: string;
  label: string;
  configured: boolean;
  source: string | null;
  credentialError?: string | null;
  credentialCount?: number;
};

export type StudioInventoryDiscovery = {
  attempted?: boolean;
  ok?: boolean;
  error?: string | null;
  returnedModelCount?: number;
};

export type StudioInventoryPayload = {
  ok?: boolean;
  error?: string;
  schemaVersion?: string;
  generatedAt?: string;
  authority?: string;
  credential_plane?: string;
  providers?: StudioInventoryProvider[];
  discovery?: Record<string, StudioInventoryDiscovery>;
  availableModels?: StudioInventoryModel[];
  credentialModels?: StudioInventoryModel[];
  credentialDiscovery?: Array<Record<string, unknown>>;
  selection?: StudioModelSelection | null;
};

function modelKey(model: StudioInventoryModel) {
  return `${String(model.provider || "").toLowerCase()}:${model.model_id}`;
}

export function mergeInventoryPayloads(
  local: StudioInventoryPayload | null | undefined,
  account: StudioInventoryPayload | null | undefined,
): StudioInventoryPayload {
  const providers = new Map<string, StudioInventoryProvider>();
  for (const row of account?.providers || []) providers.set(row.id, row);
  for (const row of local?.providers || []) {
    const previous = providers.get(row.id);
    providers.set(row.id, {
      ...(previous || row),
      ...row,
      configured: row.configured || previous?.configured === true,
      source: row.configured ? row.source : previous?.source ?? row.source,
      credentialError: row.credentialError || previous?.credentialError || null,
    });
  }

  const models = new Map<string, StudioInventoryModel>();
  for (const row of account?.availableModels || []) models.set(modelKey(row), row);
  // Device/machine inventory wins duplicates because a packaged desktop executes
  // locally first and should describe the exact credential used for that path.
  for (const row of local?.availableModels || []) models.set(modelKey(row), row);

  const credentialModels = new Map<string, StudioInventoryModel>();
  for (const row of account?.credentialModels || account?.availableModels || []) {
    const key = modelKey(row) + ":" + String(row.credential_id || "account");
    credentialModels.set(key, row);
  }
  for (const row of local?.credentialModels || local?.availableModels || []) {
    const key = modelKey(row) + ":" + String(row.credential_id || "machine");
    credentialModels.set(key, row);
  }

  return {
    ok: true,
    schemaVersion: local?.schemaVersion || account?.schemaVersion,
    generatedAt: local?.generatedAt || account?.generatedAt,
    authority: "per_credential_provider_discovery",
    credential_plane: local && account ? "mixed" : local?.credential_plane || account?.credential_plane,
    providers: [...providers.values()].sort((a, b) => a.label.localeCompare(b.label)),
    discovery: { ...(account?.discovery || {}), ...(local?.discovery || {}) },
    availableModels: [...models.values()],
    credentialModels: [...credentialModels.values()],
    credentialDiscovery: [...(account?.credentialDiscovery || []), ...(local?.credentialDiscovery || [])],
    selection: local?.selection || account?.selection || null,
  };
}
