function cleanName(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(normalized)) throw new Error(`invalid_${label}:${normalized || '<missing>'}`);
  return normalized;
}

function toolRows(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.tools) ? value.tools : [];
}

export async function createMcpCapabilityAdapter(options = {}) {
  const servers = options.servers || {};
  const listTools = options.listTools;
  const callTool = options.callTool;
  if (typeof callTool !== 'function') throw new TypeError('mcp_call_tool_adapter_required');
  const tools = new Map();

  for (const [rawServerName, configValue] of Object.entries(servers)) {
    const serverName = cleanName(rawServerName, 'mcp_server_name');
    const config = configValue || {};
    const discovered = config.tools || (typeof listTools === 'function' ? await listTools(serverName, config) : []);
    for (const tool of toolRows(discovered)) {
      const toolName = cleanName(tool.name, 'mcp_tool_name');
      const capabilityId = `mcp.${serverName}.${toolName}`;
      if (tools.has(capabilityId)) throw new Error(`duplicate_mcp_capability:${capabilityId}`);
      tools.set(capabilityId, Object.freeze({
        server_name: serverName,
        tool_name: toolName,
        server_config: config,
        descriptor: Object.freeze({
          name: capabilityId,
          description: String(tool.description || `Call ${toolName} on MCP server ${serverName}`),
          category: 'mcp',
          risk: tool.annotations?.readOnlyHint === true ? 'read' : (tool.risk || 'write'),
          input_schema: tool.inputSchema || tool.input_schema || { type: 'object', properties: {}, additionalProperties: true },
          strict: false,
          protocol: 'mcp',
          remote_name: toolName,
          server_name: serverName,
        }),
      }));
    }
  }

  return Object.freeze({
    toolDescriptors() { return [...tools.values()].map((row) => row.descriptor); },
    canInvoke(id) { return tools.has(String(id)); },
    async invoke(id, input = {}, context = {}) {
      const row = tools.get(String(id));
      if (!row) throw new Error(`mcp_capability_unavailable:${id}`);
      return callTool(row.server_name, row.tool_name, input, { ...context, server: row.server_config });
    },
  });
}
