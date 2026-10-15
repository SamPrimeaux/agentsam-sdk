/**
 * Host-backed AgentSam D1 tools.
 *
 * Reuse the installed MCP client's JSON-RPC transport and the IAM MCP
 * server's existing OAuth, workspace scope, D1 SQL policies and receipts.
 * No Cloudflare token lookup, local database, or replacement SQL engine.
 */
import { listMcpServers } from '../mcp/authority.js';
import { callMcpTool } from '../mcp/client.js';

export const MCP_D1_READ_TOOLS = Object.freeze(['agentsam_cf_d1_list', 'agentsam_d1_query']);
export const MCP_D1_WRITE_TOOLS = Object.freeze(['agentsam_d1_write', 'agentsam_d1_delete']);
export const MCP_D1_TOOLS = Object.freeze([...MCP_D1_READ_TOOLS, ...MCP_D1_WRITE_TOOLS]);

function validateInput(name, input) {
  if (!MCP_D1_TOOLS.includes(name)) throw new Error('mcp_d1_tool_not_supported');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('mcp_d1_input_invalid');
  if (name === 'agentsam_cf_d1_list') {
    if (Object.keys(input).length) throw new Error('mcp_d1_list_input_invalid');
    return {};
  }
  if (typeof input.database_id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.database_id))
    throw new Error('mcp_d1_database_id_invalid');
  if (typeof input.sql !== 'string' || !input.sql.trim() || input.sql.length > 12000)
    throw new Error('mcp_d1_sql_invalid');
  if (input.params !== undefined && (!Array.isArray(input.params) || input.params.length > 100 ||
      input.params.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v))))
    throw new Error('mcp_d1_params_invalid');
  const unknown = Object.keys(input).filter(key => !['database_id','sql','params'].includes(key));
  if (unknown.length) throw new Error('mcp_d1_unknown_input');
  return {database_id:input.database_id,sql:input.sql,...(input.params===undefined?{}:{params:input.params})};
}

export function normalizeD1McpResult(raw) {
  // callMcpTool() wraps tools/call; injected hosts may return the MCP
  // result directly. Never send the provider auth or client config to the LLM.
  if (raw?.ok === false) return {ok:false,error:'mcp_d1_call_failed',detail:String(raw.error || 'MCP transport failed').slice(0,300)};
  const result = raw?.result || raw;
  if (result?.isError) return {ok:false,error:'mcp_d1_server_error',detail:String(result.content?.[0]?.text || 'MCP execution rejected').slice(0,600)};
  let payload = result?.structuredContent ?? result;
  if (Array.isArray(result?.content)) {
    const text = result.content.find(item=>item.type==='text')?.text;
    if (text) {
      try { payload = JSON.parse(text); }
      catch { return {ok:false,error:'mcp_d1_invalid_response'}; }
    }
  }
  if (payload?.ok === false) return {ok:false,error:String(payload.error || 'mcp_d1_server_error').slice(0,180)};
  const bytes = Buffer.byteLength(JSON.stringify(payload ?? null));
  if (bytes > 64000) return {ok:false,error:'mcp_d1_result_too_large',next:'Use a narrower query or more selective table filter.'};
  return payload;
}

/**
 * Host injects its already-authorized tool invoker. The built-in CLI uses the
 * existing ~/.agentsam/mcp server store, without copying OAuth tokens across
 * applications or inventing an alternate credential precedence.
 */
export function createMcpD1Bridge({ invokeTool = null, serverName = 'inneranimalmedia', home, callTool = callMcpTool } = {}) {
  if (typeof invokeTool === 'function') {
    return Object.freeze({available:true,source:'host',invoke:async(name,input={})=>
      normalizeD1McpResult(await invokeTool(name,validateInput(name,input)))});
  }
  const connections = listMcpServers(home ? {home} : {});
  const server = connections.find(row=>row.name===serverName && row.url &&
    /^https:\/\//i.test(row.url) && typeof row.auth?.token==='string' && row.auth.token.trim());
  if (!server) {
    return Object.freeze({available:false,source:'mcp',reason:'mcp_d1_connection_not_configured',
      next:'agentsam mcp list --json (inspect configured MCP connections)'});
  }
  return Object.freeze({
    available:true,source:'mcp',
    invoke:async(name,input={})=>normalizeD1McpResult(await callTool(server,name,validateInput(name,input),{timeoutMs:30000})),
  });
}
