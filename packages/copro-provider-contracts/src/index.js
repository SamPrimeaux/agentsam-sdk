export const COPRO_PROVIDER_CAPABILITIES = Object.freeze([
  "media.store",
  "media.stream",
  "media.transcribe",
  "media.embed",
  "media.convert",
  "video.generate",
  "render.video",
]);

export function defineProviderAdapter({
  id,
  capabilities,
  invoke,
  health,
} = {}) {
  if (!id) throw new Error("copro_provider_id_required");
  if (!Array.isArray(capabilities) || !capabilities.length) {
    throw new Error("copro_provider_capabilities_required");
  }
  for (const capability of capabilities) {
    if (!COPRO_PROVIDER_CAPABILITIES.includes(capability)) {
      throw new Error("copro_provider_capability_unknown:" + capability);
    }
  }
  if (typeof invoke !== "function") throw new Error("copro_provider_invoke_required");

  return Object.freeze({
    id: String(id),
    capabilities: Object.freeze([...new Set(capabilities)]),
    invoke,
    health: typeof health === "function" ? health : async () => ({ ok: true }),
  });
}

export function supportsCapability(adapter, capability) {
  return Boolean(adapter?.capabilities?.includes(capability));
}

export async function invokeCapability(adapter, capability, input) {
  if (!supportsCapability(adapter, capability)) {
    throw new Error("copro_provider_capability_unsupported:" + capability);
  }
  return adapter.invoke(capability, input);
}
