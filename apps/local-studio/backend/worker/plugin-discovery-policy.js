/** Curated endpoint policy for catalog-discovered MCP providers. */
export function validatePluginCatalogEndpoint({
  pluginKey,
  source,
  endpointUrl,
  oauthResource,
  remoteMcp = false,
  identityMode = "studio_handoff",
}) {
  let sourceUrl;
  let endpoint;
  let resource = null;
  try {
    sourceUrl = new URL(source);
    endpoint = new URL(endpointUrl);
    if (oauthResource) resource = new URL(oauthResource);
  } catch {
    throw new Error("plugin_catalog_endpoint_invalid");
  }
  if (sourceUrl.protocol !== "https:" || endpoint.protocol !== "https:"
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("plugin_catalog_endpoint_invalid");
  }
  if (remoteMcp) {
    if (pluginKey !== "agentsam-remote-desktop-commander"
      || endpoint.origin !== "https://mcp.desktopcommander.app"
      || endpoint.pathname !== "/mcp"
      || !resource
      || resource.origin !== "https://mcp.desktopcommander.app"
      || resource.pathname !== "/"
      || resource.search || resource.hash
      || identityMode !== "oauth_state_bound") {
      throw new Error("plugin_catalog_external_endpoint_untrusted");
    }
    return {
      endpointUrl: endpoint.toString(),
      oauthResource: resource.origin,
      identityMode,
      remoteMcp: true,
    };
  }
  if (endpoint.origin !== sourceUrl.origin || !/^\/mcp(?:\/|$)/.test(endpoint.pathname)
    || identityMode !== "studio_handoff"
    || (resource && resource.toString() !== sourceUrl.origin + "/mcp")) {
    throw new Error("plugin_catalog_endpoint_invalid");
  }
  return {
    endpointUrl: endpoint.toString(),
    oauthResource: resource?.toString() || null,
    identityMode: "studio_handoff",
    remoteMcp: false,
  };
}
