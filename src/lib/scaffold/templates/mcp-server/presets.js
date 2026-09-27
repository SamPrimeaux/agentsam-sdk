export const MCP_SERVER_PRESETS = Object.freeze({
  heuristics: Object.freeze({
    key: 'heuristics',
    displayName: 'Heuristics MCP',
    description: 'Machine-first MCP starter with portable OAuth, identity branding, and deterministic diagnostics.',
    companyName: 'Your Company',
    companySlug: 'default',
    homepageUrl: 'https://example.com',
    audience: 'https://example.com/mcp',
    issuer: 'https://example.com',
    authMode: 'oauth',
    scopes: [
      {
        scope: 'mcp:read',
        label: 'MCP resources',
        description: 'Read approved MCP resources.',
        category: 'mcp',
        sensitivity: 'normal',
      },
    ],
  }),
});

export function getMcpServerPreset(key = 'heuristics') {
  const normalized = String(key || 'heuristics').trim().toLowerCase();
  const preset = MCP_SERVER_PRESETS[normalized];
  if (!preset) throw new Error('unknown_mcp_server_preset:' + normalized);
  return preset;
}

export function listMcpServerPresets() {
  return Object.values(MCP_SERVER_PRESETS).map((preset) => ({
    key: preset.key,
    display_name: preset.displayName,
    description: preset.description,
    company_name: preset.companyName,
    audience: preset.audience,
  }));
}
