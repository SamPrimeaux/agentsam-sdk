export type CredentialPlane = "machine" | "studio_vault" | "mixed" | "platform" | string;

export interface ProviderCredentialResolution {
  configured: boolean;
  value?: string;
  source?: string | null;
  error?: string | null;
  account_id?: string | null;
}

export interface DiscoveredModelRecord {
  provider: string;
  provider_model_id: string;
  model_id?: string;
  model_key: string;
  label: string;
  availability: string;
  availability_source?: string | null;
  context_window?: number | null;
  max_output_tokens?: number | null;
  reasoning_efforts?: string[];
  service_tiers?: string[];
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CredentialScopedInventory {
  schemaVersion: string;
  generatedAt: string;
  authority: string;
  credential_plane: CredentialPlane;
  providers: Array<{
    id: string;
    label: string;
    configured: boolean;
    source: string | null;
    credentialError: string | null;
  }>;
  discovery: Record<string, {
    attempted: boolean;
    ok: boolean;
    error: string | null;
    returnedModelCount: number;
    curation?: string;
  }>;
  providerModels: Record<string, DiscoveredModelRecord[]>;
  availableModels: DiscoveredModelRecord[];
}

export const INVENTORY_API_PROVIDERS: readonly Readonly<{
  id: string;
  label: string;
  service: string;
  env: string;
  aliases?: readonly string[];
}>[];

export const WORKERS_AI_CURATED_MODEL_IDS: readonly string[];

export function providerIdForService(serviceName: unknown): string | null;
export function filterWorkersAiCurated(models?: DiscoveredModelRecord[], options?: { curated?: boolean }): DiscoveredModelRecord[];
export function makeMapCredentialResolver(
  credentialByProvider: Map<string, { value: string; source?: string; account_id?: string }>,
): (providerId: string) => Promise<ProviderCredentialResolution>;
export function collectCredentialScopedInventory(options: {
  fetchImpl?: typeof fetch;
  credentialPlane?: CredentialPlane;
  curateWorkersAi?: boolean;
  discoverRemote?: boolean;
  resolveCredential: (providerId: string) => ProviderCredentialResolution | Promise<ProviderCredentialResolution>;
}): Promise<CredentialScopedInventory>;
export function sanitizeInventoryForClient(status?: Partial<CredentialScopedInventory>): {
  schemaVersion?: string;
  generatedAt?: string;
  authority?: string;
  credential_plane?: CredentialPlane;
  providers: CredentialScopedInventory["providers"];
  discovery: CredentialScopedInventory["discovery"];
  availableModels: Array<{
    provider: string;
    model_id: string;
    model_key: string | null;
    label: string;
    availability: string;
    availability_source: string | null;
    context_window: number | null;
    reasoning_efforts: string[];
    service_tiers: string[];
    capabilities: Record<string, unknown>;
  }>;
};
export function assertModelAvailableForProvider(
  inventory: { availableModels?: Array<Record<string, unknown>> },
  provider: string,
  modelId: string,
): Record<string, unknown>;
