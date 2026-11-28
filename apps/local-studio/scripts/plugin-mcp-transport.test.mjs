import test from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {listRemoteMcpTools,callRemoteMcpTool,mcpRequest} from '../backend/worker/plugin-mcp-client.js';

const endpoint='https://fixture.example/mcp',resource='https://fixture.example',token='test-fixture-not-a-credential';
test('real SDK sessions discover and call tools over SSE at the root MCP endpoint',async()=>{
  const methods=[],sessions=new Map();
  let invoked=0;
  const fetcher=async(url,init)=>{
    assert.equal(url,endpoint);assert.equal(init.redirect,'manual');
    const rpc=init.body?JSON.parse(init.body):null;
    methods.push(rpc?.method||init.method);
    let transport=sessions.get(init.headers['mcp-session-id']);
    if(rpc?.method==='initialize'){
      const server=new McpServer({name:'fixture',version:'1.0.0'});
      server.registerTool('fixture.read',{description:'Read fixture'},async()=>{invoked++;return {content:[{type:'text',text:'verified'}]}});
      transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:()=>crypto.randomUUID(),onsessioninitialized:id=>sessions.set(id,transport),onsessionclosed:id=>sessions.delete(id)});
      await server.connect(transport);
    }else{
      assert.ok(transport,'must preserve session');
      assert.ok(init.headers['mcp-protocol-version']);
    }
    return transport.handleRequest(new Request(url,init));
  };
  assert.deepEqual((await listRemoteMcpTools(endpoint,resource,token,fetcher)).map(x=>x.name),['fixture.read']);
  assert.deepEqual(await callRemoteMcpTool(endpoint,resource,token,'fixture.read',{},fetcher),[{type:'text',text:'verified'}]);
  assert.equal(invoked,1);
  assert.deepEqual(methods,['initialize','notifications/initialized','tools/list','DELETE','initialize','notifications/initialized','tools/call','DELETE']);
  assert.equal(sessions.size,0);
});
const reply=(id,result)=>Response.json({jsonrpc:'2.0',id,result});
const mock=handler=>async(_url,init)=>{
  const rpc=JSON.parse(init.body);
  if(rpc.method==='initialize')return reply(rpc.id,{protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'test'}});
  if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  return handler(rpc);
};
test('bounded pagination preserves one session and rejects duplicate tool names or repeated cursors',async()=>{
  const tools=await listRemoteMcpTools(endpoint,resource,token,mock(rpc=>reply(rpc.id,rpc.params.cursor?{tools:[{name:'b'}]}:{tools:[{name:'a'}],nextCursor:'p2'})));
  assert.deepEqual(tools.map(t=>t.name),['a','b']);
  await assert.rejects(listRemoteMcpTools(endpoint,resource,token,mock(rpc=>reply(rpc.id,{tools:[{name:'a'}],nextCursor:'p2'}))),/plugin_mcp_tools_invalid/);
});
test('response ID mismatch, unauthorized results and oversized replies fail closed; writes are not retried',async()=>{
  let calls=0;
  await assert.rejects(mcpRequest(endpoint,resource,token,'tools/call',{},mock(rpc=>{calls++;return reply('other-id',{})})),/response_id_mismatch/);
  assert.equal(calls,1);
  await assert.rejects(mcpRequest(endpoint,resource,token,'tools/list',{},mock(()=>new Response(null,{status:401}))),/auth_expired/);
  await assert.rejects(mcpRequest(endpoint,resource,token,'tools/list',{},mock(rpc=>reply(rpc.id,{large:'x'.repeat(350001)}))),/response_too_large/);
  await assert.rejects(mcpRequest('https://other.example/mcp',resource,token,'tools/list',{},mock(()=>{throw new Error('must not send')})),/endpoint_invalid/);
});
