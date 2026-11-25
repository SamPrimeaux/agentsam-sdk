/**
 * Local Studio model inventory adapter.
 *
 * The SDK discovery contract is authoritative. Inventory is live per credential:
 * callers provide only the credentials owned by the current user/device/account,
 * and provider APIs determine which models that credential can actually see.
 */
import {
  assertModelAvailableForProvider,
  collectCredentialScopedInventory,
  sanitizeInventoryForClient,
  WORKERS_AI_CURATED_MODEL_IDS,
} from "@inneranimalmedia/agentsam-sdk/models/inventory";
import {
  type StudioCredential,
  type StudioCredentialRecord,
  type StudioModelProviderDefinition,
} from "./studio-vault.ts";

export const WORKERS_AI_CURATED = WORKERS_AI_CURATED_MODEL_IDS;

export function platformCredentials(env: NodeJS.ProcessEnv) {
  const map = new Map<string, StudioCredential>();
  const put = (id: string, value?: string, extra: Record<string, string | null | undefined> = {}) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    map.set(id, { value: clean, source: "platform", ...extra });
  };
  put("openai", env.OPENAI_API_KEY);
  put("anthropic", env.ANTHROPIC_API_KEY);
  put("gemini", env.GEMINI_API_KEY);
  put("xai", env.XAI_API_KEY);
  put("cursor", env.CURSOR_API_KEY);
  put("cloudflare", env.CLOUDFLARE_API_TOKEN, {
    cloudflare_account_id: env.CLOUDFLARE_ACCOUNT_ID || null,
  });
  return map;
}

export async function buildStudioInventory(
  credentials: Map<string, StudioCredential> | StudioCredentialRecord[],
  providers?: StudioModelProviderDefinition[],
) {
  const records: StudioCredentialRecord[] = Array.isArray(credentials)
    ? credentials
    : [...credentials.entries()].map(([provider, credential]) => ({
      id: credential.source + ":" + provider,
      provider,
      serviceName: provider,
      name: provider,
      last4: null,
      ...credential,
    }));
  const hasVault = records.some((credential) => credential.source === "user_vault");
  const hasPlatform = records.some((credential) => credential.source === "platform");
  const credentialPlane = hasVault ? (hasPlatform ? "mixed" : "studio_vault") : "platform";
  const status = await collectCredentialScopedInventory({
    credentialPlane,
    credentialRecords: records,
    ...(providers ? { providers } : {}),
  });
  return sanitizeInventoryForClient(status);
}

export function assertModelAvailable(
  inventory: { availableModels?: Array<Record<string, unknown>> },
  provider: string,
  modelId: string,
) {
  return assertModelAvailableForProvider(inventory, provider, modelId);
}


type StudioInventoryRow = Record<string, unknown>;
type StudioInventorySnapshot = {
  availableModels?: StudioInventoryRow[];
  credentialModels?: StudioInventoryRow[];
  providers?: StudioInventoryRow[];
  discovery?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Add the host's Workers AI binding as a distinct resource lane.
 * Its candidates come from the explicit Workers AI allowlist, never from a
 * provider API-key model list or a fabricated successful probe.
 */
export function mergeBoundWorkersAIInventory(
  inventory: StudioInventorySnapshot,
  binding: unknown,
): StudioInventorySnapshot {
  if (!binding || typeof (binding as { run?: unknown }).run !== "function") return inventory;

  const availableModels = Array.isArray(inventory.availableModels)
    ? [...inventory.availableModels]
    : [];
  const credentialModels = Array.isArray(inventory.credentialModels)
    ? [...inventory.credentialModels]
    : [];
  const providers = Array.isArray(inventory.providers) ? [...inventory.providers] : [];
  const cloudflareIndex = providers.findIndex((row) => row.id === "cloudflare");
  const previous = cloudflareIndex >= 0 ? providers[cloudflareIndex] : undefined;
  const configured: StudioInventoryRow = {
    ...previous,
    id: "cloudflare",
    label: previous?.label || "Cloudflare Workers AI",
    configured: true,
    source: previous?.configured ? previous.source : "host_workers_ai_binding",
    bindingConfigured: true,
  };
  if (cloudflareIndex >= 0) providers[cloudflareIndex] = configured;
  else providers.push(configured);

  const ids = [...new Set(WORKERS_AI_CURATED_MODEL_IDS)];
  for (const id of ids) {
    const index = availableModels.findIndex((row) => row.provider === "cloudflare" && row.model_id === id);
    const discovered = index >= 0 ? availableModels[index] : undefined;
    const candidate: StudioInventoryRow = {
      ...discovered,
      provider: "cloudflare",
      model_id: id,
      model_key: discovered?.model_key || "cloudflare:" + id,
      label: discovered?.label || id,
      availability: discovered?.availability || "binding_configured",
      availability_source: discovered?.availability_source || "host_workers_ai_binding",
      capabilities: {
        ...(discovered?.capabilities as Record<string, unknown> | undefined),
        workers_ai: true,
        agent_runtime: true,
        text_output: true,
      },
      chat_eligible: true,
      eligibility_reason: null,
      eligibility_source: "host_workers_ai_binding_allowlist",
      hint: "Host binding configured; selected model execution is verified when requested.",
    };
    if (index < 0) availableModels.push(candidate);
    else availableModels[index] = candidate;

    const credentialIndex = credentialModels.findIndex((row) =>
      row.provider === "cloudflare" && row.model_id === id && row.credential_source === "host_workers_ai_binding",
    );
    const credentialCandidate: StudioInventoryRow = {
      ...candidate,
      credential_id: "host:cloudflare",
      credential_name: "Host Workers AI binding",
      credential_last4: null,
      credential_source: "host_workers_ai_binding",
      visible: true,
    };
    if (credentialIndex < 0) credentialModels.push(credentialCandidate);
    else credentialModels[credentialIndex] = credentialCandidate;
  }

  return {
    ...inventory,
    providers,
    availableModels,
    credentialModels,
    discovery: {
      ...(inventory.discovery || {}),
      cloudflare: {
        ...((inventory.discovery?.cloudflare as Record<string, unknown> | undefined) || {}),
        bindingConfigured: true,
        bindingModelCount: ids.length,
        bindingAuthority: "host_workers_ai_binding_allowlist",
      },
    },
  };
}
