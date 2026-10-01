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
import { credentialPlaneFor, type StudioCredential } from "./studio-vault.ts";

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

export async function buildStudioInventory(credentials: Map<string, StudioCredential>) {
  const status = await collectCredentialScopedInventory({
    credentialPlane: credentialPlaneFor(credentials),
    resolveCredential: async (providerId: string) => {
      const credential = credentials.get(providerId);
      if (!credential?.value) return { configured: false, value: "", source: null, error: null };
      return {
        configured: true,
        value: credential.value,
        source: credential.source,
        account_id: credential.cloudflare_account_id || null,
      };
    },
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
