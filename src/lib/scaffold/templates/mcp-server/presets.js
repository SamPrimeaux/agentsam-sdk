export const MCP_SERVER_PRESETS = Object.freeze({
  heuristics: Object.freeze({
    key: 'heuristics',
    displayName: 'MCP Server',
    description: 'Runnable MCP with scoped tools, runtime-specific transport and protocol tests.',
    homepageUrl: '',
    audience: '',
    issuer: '',
    authMode: 'oauth',
    scopes: [
      {
        scope: 'mcp:read',
        label: 'MCP read access',
        description: 'Use read-only tools exposed by this MCP server.',
        category: 'mcp',
        sensitivity: 'normal',
        required: true,
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
    audience: preset.audience,
  }));
}
