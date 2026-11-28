/** Bounded Streamable HTTP MCP sessions for catalog-authorized plugins. */
const LIMIT=350_000;
const VERSIONS=new Set(['2025-11-25','2025-06-18','2025-03-26','2024-11-05']);
const PREFERRED='2025-11-25';
function boundedUrl(endpoint,resource) {
  const u=new URL(endpoint),r=new URL(resource);
  if(u.protocol!=='https:'||r.protocol!=='https:'||u.origin!==r.origin
    ||!/^\/mcp(?:\/|$)/.test(u.pathname)||u.search||u.hash||u.username||u.password
    ||r.username||r.password||r.search||r.hash)throw new Error('plugin_mcp_endpoint_invalid');
  return u.toString();
}
function checkResponse(response) {
  if((response.status>=300&&response.status<400)||response.type==='opaqueredirect')throw new Error('plugin_mcp_redirect_rejected');
  if(!response.ok)throw new Error(response.status===401?'plugin_mcp_auth_expired':'plugin_mcp_http_'+response.status);
}
async function readRpc(response,id) {
  if(Number(response.headers.get('content-length')||0)>LIMIT)throw new Error('plugin_mcp_response_too_large');
  if(!response.body)throw new Error('plugin_mcp_result_missing');
  const sse=(response.headers.get('content-type')||'').includes('text/event-stream');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let bytes=0,buffer='',data=[];
  const match=value=>{
    let payload;
    try{payload=JSON.parse(value)}catch{throw new Error('plugin_mcp_invalid_json')}
    if(payload?.jsonrpc!=='2.0')throw new Error('plugin_mcp_rpc_error');
    if(payload.id!==id)return undefined;
    if(payload.error)throw new Error('plugin_mcp_rpc_error');
    if(!Object.hasOwn(payload,'result'))throw new Error('plugin_mcp_result_missing');
    return {value:payload.result};
  };
  const consume=()=>{
    let nl;
    while((nl=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,nl).replace(/\r$/,'');buffer=buffer.slice(nl+1);
      if(line===''){
        const result=data.length?match(data.join('\n')):undefined;data=[];
        if(result)return result;
      }else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
    }
  };
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;if(bytes>LIMIT)throw new Error('plugin_mcp_response_too_large');
      buffer+=decoder.decode(value,{stream:true});
      if(sse){const found=consume();if(found)return found.value;}
    }
    buffer+=decoder.decode();
    const found=sse?(consume()||(data.length?match(data.join('\n')):undefined)):match(buffer);
    if(!found)throw new Error('plugin_mcp_response_id_mismatch');
    return found.value;
  }finally{void reader.cancel().catch(()=>{});}
}
async function withMcpSession(endpoint,resource,accessToken,fetcher,operation) {
  const url=boundedUrl(endpoint,resource);
  if(typeof accessToken!=='string'||accessToken.length<12)throw new Error('plugin_mcp_token_missing');
  let session='',version='';
  const request=async(httpMethod,body,timeout=15000)=>{
    const headers={'content-type':'application/json',accept:'application/json, text/event-stream',authorization:'Bearer '+accessToken};
    if(session)headers['mcp-session-id']=session;
    if(version)headers['mcp-protocol-version']=version;
    const response=await fetcher(url,{method:httpMethod,redirect:'manual',headers,
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
    checkResponse(response);return response;
  };
  const rpc=async(name,args)=>{
    const id=crypto.randomUUID();
    const response=await request('POST',{jsonrpc:'2.0',id,method:name,params:args});
    if(name==='initialize'){
      const assigned=response.headers.get('mcp-session-id');
      if(assigned){if(!/^[\x21-\x7e]{1,512}$/.test(assigned))throw new Error('plugin_mcp_session_invalid');session=assigned;}
    }
    return readRpc(response,id);
  };
  try{
    const initialized=await rpc('initialize',{protocolVersion:PREFERRED,capabilities:{},clientInfo:{name:'AgentSam Studio',version:'1'}});
    if(!VERSIONS.has(initialized?.protocolVersion)||!initialized.capabilities||!initialized.serverInfo)throw new Error('plugin_mcp_initialize_invalid');
    version=initialized.protocolVersion;
    const notified=await request('POST',{jsonrpc:'2.0',method:'notifications/initialized'});
    if(notified.status!==202)throw new Error('plugin_mcp_notification_invalid');
    return await operation(rpc);
  }finally{
    if(session){
      // Best effort teardown. Never retry a tool call or redirect credentials.
      try{const response=await request('DELETE',undefined,3000);void response.body?.cancel().catch(()=>{});}catch{}
    }
  }
}
export async function mcpRequest(endpoint,resource,accessToken,method,params={},fetcher=fetch) {
  return withMcpSession(endpoint,resource,accessToken,fetcher,rpc=>rpc(method,params));
}
export async function listRemoteMcpTools(endpoint,resource,token,fetcher=fetch) {
  return withMcpSession(endpoint,resource,token,fetcher,async rpc=>{
    const tools=[],cursors=new Set(),names=new Set();
    let cursor;
    for(let page=0;page<10;page++){
      const result=await rpc('tools/list',cursor?{cursor}:{});
      if(!Array.isArray(result?.tools)||tools.length+result.tools.length>150)throw new Error('plugin_mcp_tools_invalid');
      for(const tool of result.tools){
        if(typeof tool?.name!=='string'||!tool.name||names.has(tool.name))throw new Error('plugin_mcp_tools_invalid');
        names.add(tool.name);tools.push(tool);
      }
      cursor=result.nextCursor;
      if(cursor===undefined)return tools;
      if(typeof cursor!=='string'||!cursor||cursor.length>1024||cursors.has(cursor))throw new Error('plugin_mcp_cursor_invalid');
      cursors.add(cursor);
    }
    throw new Error('plugin_mcp_tools_invalid');
  });
}
export async function callRemoteMcpTool(endpoint,resource,token,name,args,fetcher=fetch) {
  const result=await mcpRequest(endpoint,resource,token,'tools/call',{name,arguments:args},fetcher);
  if(result.isError===true)throw new Error('plugin_mcp_tool_failed');
  return result.structuredContent??result.content??result;
}
