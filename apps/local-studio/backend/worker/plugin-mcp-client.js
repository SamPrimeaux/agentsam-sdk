/** Bounded Streamable HTTP JSON-RPC MCP transport for approved remote plugins. */
const LIMIT=350_000;
function boundedUrl(endpoint,resource) {
  const u=new URL(endpoint);
  const r=new URL(resource);
  if(u.protocol!=='https:' || u.origin!==r.origin || !u.pathname.startsWith('/mcp/')
    || u.search || u.hash || u.username || u.password) throw new Error('plugin_mcp_endpoint_invalid');
  return u.toString();
}
export async function mcpRequest(endpoint,resource,accessToken,method,params={},fetcher=fetch) {
  const url=boundedUrl(endpoint,resource);
  if(typeof accessToken!=='string'||accessToken.length<12)throw new Error('plugin_mcp_token_missing');
  const response=await fetcher(url,{
    // Workers fetch supports manual redirects, not redirect:'error'.
    method:'POST',redirect:'manual',
    headers:{'content-type':'application/json',accept:'application/json, text/event-stream',authorization:'Bearer '+accessToken},
    body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),
    signal:AbortSignal.timeout(15000),
  });
  if(response.status>=300&&response.status<400||response.type==='opaqueredirect')throw new Error('plugin_mcp_redirect_rejected');
  if(!response.ok)throw new Error(response.status===401?'plugin_mcp_auth_expired':'plugin_mcp_http_'+response.status);
  if(Number(response.headers.get('content-length')||0)>LIMIT)throw new Error('plugin_mcp_response_too_large');
  const body=await response.text();
  if(body.length>LIMIT)throw new Error('plugin_mcp_response_too_large');
  let payload;
  try{payload=JSON.parse(body)}catch{throw new Error('plugin_mcp_invalid_json')}
  if(payload?.jsonrpc!=='2.0'||payload?.error)throw new Error('plugin_mcp_rpc_error');
  if(!payload?.result)throw new Error('plugin_mcp_result_missing');
  return payload.result;
}
export async function listRemoteMcpTools(endpoint,resource,token,fetcher=fetch) {
  const result=await mcpRequest(endpoint,resource,token,'tools/list',{},fetcher);
  if(!Array.isArray(result.tools)||result.tools.length>150)throw new Error('plugin_mcp_tools_invalid');
  return result.tools;
}
export async function callRemoteMcpTool(endpoint,resource,token,name,args,fetcher=fetch) {
  const result=await mcpRequest(endpoint,resource,token,'tools/call',{name,arguments:args},fetcher);
  if(result.isError===true)throw new Error('plugin_mcp_tool_failed');
  return result.structuredContent??result.content??result;
}
