import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpServerProject } from '../../src/lib/scaffold/mcp-server.js';
import { validateMcpProject } from '../../src/lib/scaffold/mcp-project.js';
import { registerWorkspaceReadTools } from '../../src/mcp/server/workspace.js';
import { authorizeMcpRequest } from '../../src/mcp/server/oauth.js';

async function fixture(t, runtime, transport) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.mcp-runtime-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createMcpServerProject({ projectName:'mcp-runtime-test', runtime, transport, outputDir:root });
  return root;
}
test('runtime selection produces native projects with valid manifests', async t => {
  for (const [runtime,transport] of [['node','stdio'],['node','streamable_http'],['python','stdio'],['cloudflare-worker','streamable_http']]) {
    const root = await fixture(t,runtime,transport);
    const result = await validateMcpProject(root);
    assert.equal(result.runtime,runtime);
    assert.equal(result.transport,transport);
    assert.ok(!result.manifest.tools.some(tool=>tool.name.startsWith('workspace.')));
    if(runtime !== 'cloudflare-worker') await assert.rejects(fs.access(path.join(root,'wrangler.jsonc')));
    if(runtime === 'python') {
      assert.match(await fs.readFile(path.join(root,'pyproject.toml'),'utf8'), /agentsam-sdk\[mcp\]/);
      await assert.rejects(fs.access(path.join(root,'package.json')));
    }
  }
  await assert.rejects(createMcpServerProject({projectName:'invalid',runtime:'python',transport:'streamable_http'}),/mcp_runtime_transport_unsupported/);
});
test('generated Node stdio communicates with a real MCP client', async t => {
  const root = await fixture(t,'node','stdio');
  const client = new Client({ name:'acceptance',version:'1' });
  await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(root,'src/stdio.js')]}));
  try {
    assert.equal((await client.listTools()).tools.length,4);
    const result = await client.callTool({name:'math.calculate',arguments:{left:6,right:7,operation:'multiply'}});
    assert.equal(result.structuredContent.result,42);
  } finally { await client.close(); }
});
test('generated Node HTTP communicates over a real loopback socket', {timeout:15000}, async t => {
  const root=await fixture(t,'node','streamable_http');
  const child=spawn(process.execPath,[path.join(root,'src/http.js')],{env:{...process.env,HOST:'127.0.0.1',PORT:'0',MCP_AUTH_MODE:'public'},stdio:['ignore','ignore','pipe']});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill();await done;}});
  const port=await new Promise((resolve,reject)=>{
    let output='';
    child.stderr.on('data',chunk=>{output+=chunk;const m=output.match(/listening on 127\.0\.0\.1:(\d+)/);if(m)resolve(Number(m[1]));});
    child.once('error',reject);child.once('exit',code=>reject(new Error('HTTP process exited '+code+' '+output)));
  });
  const client=new Client({name:'acceptance',version:'1'});
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:'+port+'/mcp')));
  try {
    assert.equal((await client.listTools()).tools.length,4);
    const r=await client.callTool({name:'text.transform',arguments:{text:'hello',operation:'uppercase'}});
    assert.equal(r.structuredContent.result,'HELLO');
  } finally { await client.close(); }
});
test('workspace tool needs declared tool, scope and fresh host grant', async t=>{
  const root=await fixture(t,'node','stdio');
  await fs.writeFile(path.join(root,'example.txt'),'example');
  const handlers=new Map();
  const server={registerTool(name,_schema,handler){handlers.set(name,handler)}};
  const manifest={tools:[{name:'workspace.read',required_scopes:['workspace:read']}]};
  const principal={kind:'local',scopes:['workspace:read']};
  assert.throws(()=>registerWorkspaceReadTools(server,{manifest,principal}),/authority_required/);
  let allow=false;
  registerWorkspaceReadTools(server,{manifest,principal,authorize:async()=>({allowed:allow,root})});
  assert.equal((await handlers.get('workspace.read')({path:'example.txt'})).isError,true);
  allow=true;
  assert.equal((await handlers.get('workspace.read')({path:'example.txt'})).structuredContent.content,'example');
  assert.equal((await handlers.get('workspace.read')({path:'../outside'})).isError,true);
  allow=false;
  assert.equal((await handlers.get('workspace.read')({path:'example.txt'})).isError,true);
});
test('public HTTP is refused outside loopback',async()=>{
  const manifest={auth:{type:'public'},scopes:[]};
  const r=await authorizeMcpRequest(new Request('https://example.com/mcp'),manifest);
  assert.equal(r.ok,false);
  assert.equal(r.response.status,403);
});

test('account policy denies absent grants and uses canonical account/device records', async () => {
  const {createAccountWorkspaceAuthorizer}=await import('../../src/mcp/server/account-workspace-policy.js');
  let allowed=true, device=true, blocked=false, calls=0;
  const db={prepare(sql){return {bind(){return this},async first(){
    if(sql.includes('blocklist'))return blocked?{workspace_id:'w'}:null;
    if(sql.includes('workspace_members'))return {id:'w',root_path:'/fixture'};
    return {id:'verified'};
  },async all(){
    if(sql.includes('agentsam_user_policy'))return {results:[{tool_risk_level_max:'low'}]};
    if(sql.includes('agentsam_mcp_allowlist'))return {results:[{is_allowed:allowed?1:0}]};
    return {results:[{id:'tool',risk_level:'low'}]};
  }}}};
  const authorize=createAccountWorkspaceAuthorizer({db,accountId:'a',workspaceId:'w',connectionId:'c',resolveDeviceGrant:async()=>{calls++;return {allowed:device,accountId:'a',workspaceId:'w',connectionId:'c',root:'/fixture'}}});
  const input={principal:{kind:'oauth',account_id:'a'},operation:'workspace.read',input:{path:'example.txt'}};
  assert.equal((await authorize(input)).allowed,true);
  device=false;assert.equal((await authorize(input)).allowed,false);
  allowed=false;assert.equal((await authorize(input)).allowed,false);
  assert.equal(calls,2);
  blocked=true;assert.equal((await authorize(input)).allowed,false);
  assert.equal((await authorize({...input,principal:{kind:'oauth',account_id:'other'}})).allowed,false);
});

test('explicit local project connection invokes real declared tools without trusting a catalog',async t=>{
  const root=await fixture(t,'node','stdio');
  const {runMcp}=await import('../../src/commands/mcp.js');
  const options={write(){}};
  await assert.rejects(runMcp(['project-tools',root],options),/explicit_trust_required/);
  const tools=await runMcp(['project-tools',root,'--trust-project'],options);
  assert.equal(tools.tools.length,4);
  const result=await runMcp(['project-call',root,'--trust-project','--tool','math.calculate','--input','{"left":6,"right":7,"operation":"multiply"}'],options);
  assert.equal(result.result.result,42);
  await assert.rejects(runMcp(['project-call',root,'--trust-project','--tool','workspace.read'],options),/tool_not_declared/);
});
