export function resolveProvider(manifest, capability = "code.generate") {
  const providers = (manifest && manifest.providers) || [];
  const match = providers.find((provider) => (provider.capabilities || []).includes(capability));
  if (!match) throw new Error("no provider for " + capability);
  return {
    provider: match.name || "",
    model: match.model || "",
    endpoint: match.endpoint || "",
    capability,
    supports: match.supports || {},
  };
}

function resolveEndpoint(endpoint, baseUrl) {
  if (/^https?:\/\//i.test(String(endpoint || ""))) return String(endpoint);
  if (!baseUrl) throw new Error("provider base url missing");
  return new URL(String(endpoint || ""), baseUrl).toString();
}

export async function generateWithProvider(manifest, request, signal, options = {}) {
  const capability = options.capability || request?.capability || "code.generate";
  const selected = resolveProvider(manifest, capability);
  const endpoint = resolveEndpoint(selected.endpoint, options.baseUrl);
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {}),
  };
  const response = await fetch(endpoint, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify({
      capability,
      provider: selected.provider,
      model: selected.model,
      input: request,
    }),
  });
  return { selected, response };
}
