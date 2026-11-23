import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectUniversalRegistry } from '../../src/registry/universal-reconcile.js';

const source={
  schema:'agentsam.universal-source-registry.v1',
  commands:[{id:'cli_npm',package_name:'@inneranimalmedia/agentsam-sdk',package_version:'2.6.18',source_sha256:'abc'}],
  tools:[{id:'repository.inspect'}],skills:[{name:'AgentSam Application Fundamentals'}],
  scripts:[{source:'scripts/example.mjs'}],hooks:[],rules:[],
};
test('reconciliation is read-only, account-gated, and preserves workflow/hook history',async()=>{
  const calls=[];
  const db={prepare(sql){return {bind(...values){calls.push({sql,values});return{async all(){
    if(sql.includes('COUNT(*) AS n FROM agentsam_commands_legacy'))return{results:[{n:36}]};
    if(sql.includes('COUNT(*) AS n FROM agentsam_commands'))return{results:[{n:36}]};
    if(sql.includes('FROM agentsam_commands_next'))return{results:[]};
    if(sql.includes('FROM agentsam_tools'))return{results:[{tool_key:'repository.inspect'}]};
    if(sql.includes('FROM agentsam_workflows'))return{results:[{id:'wf_1',workflow_key:'code.index.build',revision:1,scope_type:'platform',account_id:null,lifecycle:'active'}]};
    if(sql.includes('AS hook_executions'))return{results:[{hook_executions:42,workflow_nodes:32,workflow_edges:27,workflow_runs:1,workflow_triggers:11}]};
    return{results:[]};
  }}};}}};
  const report=await inspectUniversalRegistry(db,source);
  assert.equal(report.mode,'read_only');
  assert.equal(report.commands.legacy_count,36);
  assert.equal(report.tools.matched,1);
  assert.equal(report.skills.status,'account_required');
  assert.equal(report.workflows.live.length,1);
  assert.equal(report.execution_history.workflow_runs,1);
  assert.ok(calls.every(c=>/^\s*SELECT\b/i.test(c.sql)));
  assert.ok(calls.every(c=>!c.sql.includes('FROM agentsam_skill')));
  assert.ok(calls.every(c=>!c.sql.includes('FROM agentsam_scripts')));
});
test('account and workspace resources use exact signed-in scope',async()=>{
  const calls=[];
  const db={prepare(sql){return{bind(...values){calls.push({sql,values});return{async all(){return{results:[]};}}}}}};
  await inspectUniversalRegistry(db,source,{accountId:'account_123',workspaceId:'workspace_456',userId:'user_789'});
  assert.ok(calls.some(c=>c.sql.includes('FROM agentsam_skill WHERE account_id=?')&&c.values[0]==='account_123'));
  assert.ok(calls.some(c=>c.sql.includes('FROM agentsam_scripts WHERE workspace_id=?')&&c.values[0]==='workspace_456'));
  assert.ok(calls.some(c=>c.sql.includes('FROM agentsam_hook WHERE workspace_id=? AND user_id=?')&&c.values[1]==='user_789'));
  assert.ok(calls.some(c=>c.sql.includes("scope_type='platform' OR account_id=?")&&c.values[0]==='account_123'));
});
