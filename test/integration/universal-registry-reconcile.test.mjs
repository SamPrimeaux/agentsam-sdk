import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectUniversalRegistry } from '../../src/registry/universal-reconcile.js';
const catalog={
  schema:'agentsam.universal-source-registry.v1',
  commands:[{id:'cli_1',package_name:'@inneranimalmedia/agentsam-sdk',package_version:'2.6.18',source_sha256:'sha'}],
  tools:[{id:'repository.inspect'}],
  skills:[{id:'sdk',source:'skills/sdk/SKILL.md',npm_package_name:'@inneranimalmedia/agentsam-sdk',
    npm_source_version:'2.6.18',content_checksum:'checksum'}],
  scripts:[{source:'scripts/example.mjs'}],hooks:[],rules:[],
};
function fixture(resolve){
  const calls=[];
  const db={
    prepare(sql){
      return{
        bind(...values){
          calls.push({sql,values});
          return{async all(){return{results:resolve(sql,values)||[]};}};
        },
      };
    },
  };
  return{db,calls};
}
test('platform discovery cannot read any unscoped private execution history',async()=>{
  const {db,calls}=fixture(sql=>{
    if(sql.includes('COUNT(*) AS n FROM agentsam_commands'))return[{n:36}];
    if(sql.includes('FROM agentsam_tools'))return[{tool_key:'repository.inspect'}];
    if(sql.includes('FROM agentsam_skill_next'))return[
      {file_path:'skills/sdk/SKILL.md',content_checksum:'checksum',npm_package_name:'@inneranimalmedia/agentsam-sdk',npm_version:'2.6.18',is_published:0},
    ];
    if(sql.includes('FROM agentsam_workflows'))return[
      {id:'wf_test',workflow_key:'code.index.build',revision:1,scope_type:'platform',lifecycle:'active',entry_node_key:'start'},
    ];
    if(sql.includes('FROM agentsam_workflow_nodes'))return[
      {workflow_id:'wf_test',node_key:'start',node_kind:'action'},
      {workflow_id:'wf_test',node_key:'out',node_kind:'output'},
    ];
    if(sql.includes('FROM agentsam_workflow_edges'))return[
      {workflow_id:'wf_test',from_node_key:'start',to_node_key:'out'},
    ];
    return[];
  });
  const report=await inspectUniversalRegistry(db,catalog);
  assert.equal(report.commands.legacy_count,36);
  assert.equal(report.tools.matched,1);
  assert.equal(report.skills.matched,1);
  assert.equal(report.workflows.definitions[0].entry_valid,true);
  assert.equal(report.workflows.definitions[0].dangling_edges,0);
  assert.equal(report.execution_history.workflow_runs,null);
  assert.equal(report.execution_history.hook_executions,null);
  assert.ok(calls.every(x=>/^\s*SELECT\b/i.test(x.sql)));
  assert.ok(calls.every(x=>!x.sql.includes('FROM agentsam_workflow_runs')));
  assert.ok(calls.every(x=>!x.sql.includes('FROM agentsam_hook_execution')));
  assert.ok(calls.every(x=>!x.sql.includes('FROM agentsam_scripts')));
});
test('account and tenant histories require exact scoped identifiers',async()=>{
  const {db,calls}=fixture(sql=>{
    if(sql.includes('FROM agentsam_workflow_runs'))return[{n:5}];
    if(sql.includes('FROM agentsam_hook_execution'))return[{n:7}];
    if(sql.includes('FROM agentsam_skill WHERE'))return[{n:100}];
    return[];
  });
  const report=await inspectUniversalRegistry(db,catalog,{
    accountId:'acc_1',tenantId:'tenant_2',workspaceId:'ws_3',userId:'user_4',
  });
  assert.equal(report.execution_history.workflow_runs,5);
  assert.equal(report.execution_history.hook_executions,7);
  assert.equal(report.skills.account_legacy_count,100);
  assert.ok(calls.some(x=>x.sql.includes('FROM agentsam_scripts WHERE tenant_id=? AND workspace_id=?')&&x.values[0]==='tenant_2'));
  assert.ok(calls.some(x=>x.sql.includes('FROM agentsam_hook WHERE tenant_id=? AND workspace_id=? AND user_id=?')&&x.values[2]==='user_4'));
  assert.ok(calls.some(x=>x.sql.includes('FROM agentsam_workflow_runs WHERE account_id=?')&&x.values[0]==='acc_1'));
  assert.ok(calls.some(x=>x.sql.includes('FROM agentsam_hook_execution WHERE tenant_id=? AND workspace_id=? AND user_id=?')&&x.values[0]==='tenant_2'));
});
