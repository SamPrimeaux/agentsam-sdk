import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startLocalPtyServer } from '../../src/local-pty/server.js';
import { createNativeWorkspaceGrant, serveNativeWorkspace } from '../../src/mcp/server/studio-host.js';
import { createAccountWorkspacePolicy } from '../../src/mcp/server/account-workspace-policy.js';
import { DatabaseSync } from 'node:sqlite';

function fixture(root) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE accounts(id TEXT,status TEXT);
    CREATE TABLE terminal_connections(id TEXT,instance_id TEXT,account_id TEXT,is_active INTEGER);
    CREATE TABLE terminal_instances(id TEXT,account_id TEXT,provider TEXT);
    CREATE TABLE agentsam_workspace(id TEXT,tenant_id TEXT,root_path TEXT);
    CREATE TABLE workspace_members(workspace_id TEXT,tenant_id TEXT,user_id TEXT,is_active INTEGER);
    CREATE TABLE agentsam_workspace_blocklist(workspace_id TEXT,owner_user_id TEXT);
    CREATE TABLE agentsam_user_policy(user_id TEXT,workspace_id TEXT,require_allowlist_for_mcp INTEGER,mcp_tools_protection INTEGER,external_file_protection INTEGER,tool_risk_level_max TEXT);
    CREATE TABLE agentsam_mcp_allowlist(user_id TEXT,workspace_id TEXT,tool_key TEXT,is_allowed INTEGER,requires_approval INTEGER,agent_id TEXT,max_calls_per_day INTEGER,risk_level_override TEXT);
    CREATE TABLE agentsam_tools(id TEXT,tool_key TEXT,is_active INTEGER,account_id TEXT,risk_level TEXT,requires_approval INTEGER,requires_confirmation INTEGER,max_calls_per_session INTEGER);
    CREATE TABLE agentsam_tool_policy(tool_id TEXT,risk_level TEXT,requires_approval INTEGER,requires_confirmation INTEGER,max_calls_per_session INTEGER);
    INSERT INTO accounts VALUES('a','active');
    INSERT INTO terminal_instances VALUES('i','a','local');
    INSERT INTO terminal_connections VALUES('c','i','a',1);
    INSERT INTO workspace_members VALUES('w','tenant','a',1);
    INSERT INTO agentsam_user_policy VALUES('a','',1,1,1,'low');
    INSERT INTO agentsam_tools VALUES('t1','fs_read_file',1,NULL,'low',0,0,NULL);
    INSERT INTO agentsam_tools VALUES('t2','agentsam_filesystem_stat_many',1,NULL,'low',0,0,NULL);
    INSERT INTO agentsam_tools VALUES('t3','agentsam_filesystem_walk',1,NULL,'low',0,0,NULL);
    INSERT INTO agentsam_mcp_allowlist VALUES('a','w','fs_read_file',1,0,NULL,NULL,NULL);
    INSERT INTO agentsam_mcp_allowlist VALUES('a','w','agentsam_filesystem_stat_many',1,0,NULL,NULL,NULL);
    INSERT INTO agentsam_mcp_allowlist VALUES('a','w','agentsam_filesystem_walk',1,0,NULL,NULL,NULL);
  `);
  sqlite.prepare('INSERT INTO agentsam_workspace VALUES(?,?,?)').run('w','tenant',root);
  const db={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)},async all(){return {results:sqlite.prepare(sql).all(...args)}}}}}}};
  return {sqlite,db};
}

test('native workspace MCP crosses real local runtime capability and SQL account policy, then denies revocation', {timeout:15000}, async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentsam-mcp-native-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'sample.txt'),'verified file');
  await fs.writeFile(path.join(root,'.env'),'fixture secret');
  await fs.mkdir(path.join(root,'.agentsam'));
  await fs.writeFile(path.join(root,'.agentsam','private.txt'),'fixture secret');
  await fs.symlink(path.join(root,'.agentsam'),path.join(root,'alias'));
  const runtime=await startLocalPtyServer({cwd:root,port:0,pty:{spawn(){throw Error('PTY not required')}}});
  t.after(()=>runtime.close());
  const {sqlite,db}=fixture(root);
  t.after(()=>sqlite.close());
  const policy=createAccountWorkspacePolicy({db,accountId:'a',workspaceId:'w',connectionId:'c'});
  const fetchImpl=async url=>{
    const operation=new URL(url).searchParams.get('operation');
    const result=await policy({principal:{kind:'oauth',account_id:'a'},operation});
    return result.allowed?Response.json({ok:true,accountId:'a',workspaceId:'w',connectionId:'c',instanceId:result.instanceId,root:result.root}):Response.json({ok:false,error:result.reason},{status:403});
  };
  let paired=true;
  const collectDeviceContext=async()=>({instances:paired?[{instance_id:'i',connection_id:'c',account_id:'a',status:'paired'}]:[]});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  const options={root,workspaceId:'w',connectionId:'c',resolveAuthorityImpl:async()=>({value:'fixture'}),fetchImpl,collectDeviceContext};
  const server=await serveNativeWorkspace({...options,transport:serverTransport});
  const client=new Client({name:'acceptance',version:'1'});
  await client.connect(clientTransport);
  t.after(async()=>{await client.close();await server.close()});
  const call=(name,path='sample.txt')=>client.callTool({name,arguments:{path}});
  assert.equal((await call('workspace.read')).structuredContent.content,'verified file');
  assert.equal((await call('workspace.stat')).structuredContent.type,'file');
  assert.equal((await call('workspace.list','.')).structuredContent.entries.some(e=>e.path==='sample.txt'),true);
  for(const bad of ['.env','alias/private.txt','../outside'])assert.equal((await call('workspace.read',bad)).isError,true);
  paired=false;assert.equal((await call('workspace.read')).isError,true);
  paired=true;
  sqlite.exec("UPDATE agentsam_mcp_allowlist SET is_allowed=0 WHERE tool_key='fs_read_file'");
  assert.equal((await call('workspace.read')).isError,true);
  sqlite.exec("UPDATE agentsam_mcp_allowlist SET is_allowed=1 WHERE tool_key='fs_read_file';UPDATE workspace_members SET is_active=0");
  assert.equal((await call('workspace.read')).isError,true);
  sqlite.exec("UPDATE workspace_members SET is_active=1;UPDATE terminal_connections SET is_active=0");
  assert.equal((await call('workspace.read')).isError,true);
});

test('CLI registration uses the existing account registry and returns a disabled record',async()=>{
  const {runMcp}=await import('../../src/commands/mcp.js');
  let approved=false,requestCount=0;
  const result=await runMcp(['register','Fixture MCP','--url','https://example.com/mcp','--write','--json'],{
    write(){},authenticateImpl:async opts=>{assert.match(opts.scope,/iam:agent/);approved=true},
    resolveAuthorityImpl:async()=>({value:'fixture'}),
    fetchImpl:async(url,init)=>{
      assert.equal(approved,true);requestCount++;
      assert.equal(new URL(url).pathname,'/api/settings/mcps');
      assert.equal(init.method,'POST');
      assert.deepEqual(JSON.parse(init.body),{name:'Fixture MCP',url:'https://example.com/mcp'});
      return Response.json({ok:true,server:{id:'mcps_fixture',enabled:false}});
    },
  });
  assert.equal(requestCount,1);
  assert.equal(result.server.enabled,false);
});
