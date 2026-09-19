export function createMcpAdapter(config = {}) {
  return {
    type: 'engineering.mcp',
    config,
    toWorkItems(calls = []) {
      return calls.map((call) => {
        if (!call.id && !call.tool_call_id) throw new TypeError('MCP call requires id or tool_call_id');
        return {
          id: String(call.id ?? call.tool_call_id),
          title: String(call.tool_name ?? call.name ?? 'MCP call'),
          type: 'tool_call',
          status: call.status ?? 'complete',
          owner: call.actor ?? null,
          start: call.started_at ?? null,
          end: call.completed_at ?? null,
          artifacts: call.artifacts ?? [],
          evidence: call.receipt_id ? [call.receipt_id] : [],
        };
      });
    },
  };
}
