import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import {
  callMcpTool, listMcpTools, pingMcpServer, readMcpServer,
  inspectClientAdapter, getClientConfigPath, resolveServerPreset,
  syncServerToClient, withMcpClient,
} from '../../src/mcp/index.js';
import { isApprovedBrowserMcpStdio } from '../../src/mcp/browsermcp.js';
import { BROWSER_MCP_PLUGIN_MANIFEST } from '../../src/plugins/index.js';
import { runMcp } from '../../src/commands/mcp.js';
import { runPlugins } from '../../src/commands/plugins.js';

const fixture = fileURLToPath(new URL('../fixtures/browsermcp-stdio-server.mjs', import.meta.url));
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-browsermcp-'));

test('Browser MCP plugin is local-only and cannot advertise phantom Worker tools', () => {
  const p = BROWSER_MCP_PLUGIN_MANIFEST;
  assert.equal(p.plugin_key, 'browsermcp');
  assert.equal(p.plugin_kind, 'native');
  assert.equal(p.config.protocol, 'stdio');
  assert.deepEqual(p.config.args, ['@browsermcp/mcp@latest']);
  assert.equal(p.metadata.cloud_worker_execution, false);
  assert.equal(p.tools.length, 0, 'actual MCP tool list must be discovered after local pairing');
  const preset = resolveServerPreset('browsermcp', {home:home()});
  assert.equal(preset.protocol, 'stdio');
  assert.equal(preset.command, 'npx');
  assert.equal(preset.url, null);
});

test('Browser MCP stdio authority installs as a local adapter without overwriting other servers', async () => {
  const root = home();
  const logs = [];
  const result = await runMcp(['add','browsermcp','--client','agentsam','--json'], {
    home:root, write:s=>logs.push(s),
    pingMcpServerImpl:async()=>({ok:true,transport:'stdio',pairingStatus:'unverified',latencyMs:1}),
  });
  assert.equal(result.ok, true);
  assert.equal(result.ping.pairingStatus, 'unverified');
  const authority = readMcpServer('browsermcp', {home:root});
  assert.equal(isApprovedBrowserMcpStdio(authority), true);
  const configPath = getClientConfigPath('agentsam', {home:root});
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath,'utf8')).mcpServers.browsermcp, {
    type:'stdio',command:'npx',args:['@browsermcp/mcp@latest'],
  });
  assert.equal(inspectClientAdapter('agentsam','browsermcp',{home:root}).configured,true);
  assert.match(logs.join(''),/pairingStatus/);

  const tools = await runMcp(['tools','browsermcp','--json'], {
    home:root,write:()=>{},
    listMcpToolsImpl:async()=>({tools:[{name:'browser',inputSchema:{type:'object',properties:{commands:{type:'string'}},required:['commands']}}],count:1,transport:'stdio'}),
  });
  assert.deepEqual(tools.tools.map(tool=>tool.name),['browser']);

  const call = await runMcp(['call','browsermcp','--tool','browser','--input',JSON.stringify({commands:'tab list'}),'--json'], {
    home:root,write:()=>{},
    callMcpToolImpl:async (server,name,args)=>{
      assert.equal(server.protocol,'stdio');
      assert.equal(name,'browser');
      assert.deepEqual(args,{commands:'tab list'});
      return {ok:true,result:{content:[{type:'text',text:'fixture:tab list'}]}};
    },
  });
  assert.equal(call.ok,true);
  assert.throws(()=>syncServerToClient('chatgpt','browsermcp',authority,{home:root}),/stdio_mcp_requires_local_host/);
});

test('Browser MCP rejects unreviewed executable, URL override, and bearer-token injection', async () => {
  const root=home();
  const good={name:'browsermcp',protocol:'stdio',command:'npx',args:['@browsermcp/mcp@latest'],url:'',auth:null};
  for(const patch of [
    {command:'bash'}, {args:['-y','some-other-package']},
    {url:'https://elsewhere.example/mcp'}, {auth:{token:'secret'}},
  ]){
    const invalid={...good,...patch};
    assert.equal(isApprovedBrowserMcpStdio(invalid),false);
    let spawned=false;
    const result=await withMcpClient(invalid,async()=>{},{
      createStdioTransport:()=>{spawned=true;throw new Error('must_not_spawn');},
    });
    assert.equal(result.ok,false);
    assert.equal(spawned,false);
  }
  await assert.rejects(()=>runMcp(['add','browsermcp','--client','chatgpt'],{home:root,write:()=>{}}),/stdio_mcp_requires_local_host/);
  assert.equal(readMcpServer('browsermcp',{home:root}),null);
});

test('MCP stdio initialize, tools/list and tools/call work against the actual SDK transport', async () => {
  const preset=resolveServerPreset('browsermcp',{home:home()});
  const config={name:'browsermcp',protocol:'stdio',command:preset.command,args:preset.args,url:'',auth:null};
  const opts={
    timeoutMs:10000,
    createStdioTransport:()=>new StdioClientTransport({command:process.execPath,args:[fixture],stderr:'pipe'}),
  };
  const ping=await pingMcpServer(config,opts);
  assert.equal(ping.ok,true,ping.error);
  assert.equal(ping.transport,'stdio');
  assert.equal(ping.pairingStatus,'unverified');
  assert.equal(ping.toolCount,1);
  const list=await listMcpTools(config,opts);
  assert.equal(list.count,1,list.error);
  assert.equal(list.tools[0].name,'browser');
  assert.deepEqual(list.tools[0].inputSchema.required,['commands']);
  const call=await callMcpTool(config,'browser',{commands:'tab list'},opts);
  assert.equal(call.ok,true,call.error);
  assert.equal(call.transport,'stdio');
  assert.equal(call.result.content[0].text,'fixture:tab list');
});

test('AgentSam plugin installer registers metadata without executing local browser MCP', async () => {
  const cwd=home();
  const previousStdout=process.stdout.write;
  const writes=[];
  process.stdout.write=function(chunk){writes.push(String(chunk));return true;};
  try {
    const installed=await runPlugins(['install','@browsermcp','--cwd',cwd,'--json']);
    assert.equal(installed.ok,true);
    const state=JSON.parse(fs.readFileSync(path.join(cwd,'.agentsam','plugins.json'),'utf8'));
    assert.equal(state.plugins.browsermcp.manifest.config.protocol,'stdio');
    assert.equal(state.plugins.browsermcp.manifest.tools.length,0);
  }finally{process.stdout.write=previousStdout;}
});
