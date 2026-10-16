import { WORKERS_AI_CURATED_MODEL_IDS } from "@inneranimalmedia/agentsam-sdk/models/inventory";

/**
 * Advertise the host's Workers AI binding independently of account BYOK.
 *
 * A binding is a host capability, not a user vault credential. The allowlist is
 * a set of eligible candidate model IDs; individual model execution has not
 * been probed and must still be checked by the chat runtime.
 */
export function mergeBoundWorkersAIInventory(inventory, binding) {
  if (!binding || typeof binding.run !== "function") return inventory;

  const availableModels = Array.isArray(inventory?.availableModels)
    ? [...inventory.availableModels]
    : [];
  const providers = Array.isArray(inventory?.providers) ? [...inventory.providers] : [];
  const cloudflareIndex = providers.findIndex((row) => row?.id === "cloudflare");
  const previous = cloudflareIndex >= 0 ? providers[cloudflareIndex] : null;
  const configured = {
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
    const index = availableModels.findIndex((row) =>
      row?.provider === "cloudflare" && row?.model_id === id,
    );
    const discovered = index >= 0 ? availableModels[index] : null;
    const candidate = {
      ...discovered,
      provider: "cloudflare",
      model_id: id,
      model_key: discovered?.model_key || "cloudflare:" + id,
      label: discovered?.label || id,
      availability: discovered?.availability || "binding_configured",
      availability_source: discovered?.availability_source || "host_workers_ai_binding",
      capabilities: {
        ...discovered?.capabilities,
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
  }

  return {
    ...inventory,
    providers,
    availableModels,
    discovery: {
      ...(inventory?.discovery || {}),
      cloudflare: {
        ...(inventory?.discovery?.cloudflare || {}),
        bindingConfigured: true,
        bindingModelCount: ids.length,
        bindingAuthority: "host_workers_ai_binding_allowlist",
      },
    },
  };
}
