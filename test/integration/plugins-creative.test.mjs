import assert from 'node:assert/strict';import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {GSAP_CREATIVE_PLUGIN,installGSAPCreativePlugin,createGSAPCreativeDispatcher} from '../../src/plugins/creative.js';
import {listPlugins,listPluginTools,updatePluginPreferences} from '../../src/plugins/registry.js';
import {createPluginRuntime,resolvePluginDispatchTarget} from '../../src/plugins/runtime.js';
function dbFixture() {
 const sqlite = new DatabaseSync(':memory:');
 for (const file of ['0001_agentsam_plugin_runtime.sql', '0022_agentsam_plugin_registry.sql', '0023_agentsam_plugin_install_health.sql']) {
  sqlite.exec(readFileSync(new URL(`../../migrations/d1/${file}`, import.meta.url), 'utf8'));
 }
 return {
  sqlite,
  prepare(sql) {
   return {
    bind(...args) {
     const stmt = sqlite.prepare(sql);
     return {run: () => stmt.run(...args), first: () => stmt.get(...args) || null, all: () => ({results: stmt.all(...args)})};
    },
   };
  },
 };
}
const gsap={version:'test-double',registerPlugin(){},parseEase:()=>p=>1-(1-p)**3};
test('optional creative extension installs into canonical tables and executes via native runtime',async()=>{
 const db=dbFixture();try{
  assert.equal((await listPlugins(db,{accountId:'user-a'})).length,0);
  const installed=await installGSAPCreativePlugin(db,{accountId:'user-a',enabledModules:[]});
  const rows=await listPlugins(db,{accountId:'user-a'});assert.equal(rows[0].plugin_key,'gsap-creative');assert.equal(rows[0].transport,'native');assert.equal(rows[0].capabilities.length,1);
  const tools=await listPluginTools(db,{accountId:'user-a'});assert.equal(tools[0].plugin_key,'gsap-creative');assert.equal(tools[0].plugin_transport,'native');
  const runtime=createPluginRuntime({tools,accountId:'user-a',dispatchers:{native:createGSAPCreativeDispatcher({db,gsap})},db});
  const sample=await runtime.execute('gsap-creative.sample',{timeUs:500000,durationUs:1000000},{accountId:'user-a'});assert.equal(sample.value,.875);
  await assert.rejects(runtime.execute('gsap-creative.sample',{timeUs:500000,durationUs:1000000},{accountId:'user-b'}),/account_context_mismatch/);
  await updatePluginPreferences(db,{accountId:'user-a',pluginId:installed.plugin_id,enabled:false});
  await assert.rejects(runtime.execute('gsap-creative.sample',{timeUs:0,durationUs:1},{accountId:'user-a'}),/not_enabled/);
  const receipts=await db.prepare('SELECT account_id FROM agentsam_tool_call_log ORDER BY created_at_unix').bind().all();
  assert.ok(receipts.results.length>=1);assert.ok(receipts.results.every(row=>row.account_id==='user-a'));
  await installGSAPCreativePlugin(db,{accountId:'user-a'});assert.equal((await listPlugins(db,{accountId:'user-a',includeDisabled:true}))[0].is_enabled,0);
 }finally{db.sqlite.close();}
});
test('public plugin dependencies remain optional and module selection is explicit',async()=>{
 const db=dbFixture();try{
  await assert.rejects(installGSAPCreativePlugin(db,{accountId:'a',enabledModules:['remote-url']}),/unknown/);
  const installed=await installGSAPCreativePlugin(db,{accountId:'a',enabledModules:['Flip']});const [tool]=await listPluginTools(db,{accountId:'a'});
  const invoke=(dispatcher,args={timeUs:0,durationUs:1})=>dispatcher({tool,args,context:{accountId:'a'}});
  await assert.rejects(invoke(createGSAPCreativeDispatcher({db})),/runtime_unavailable/);
  await assert.rejects(invoke(createGSAPCreativeDispatcher({db,gsap})),/module_unavailable:Flip/);
  let registrations=0;const dispatcher=createGSAPCreativeDispatcher({db,gsap:{...gsap,registerPlugin(){registrations++;}},modules:{Flip:{name:'Flip'}}});await invoke(dispatcher);await invoke(dispatcher);assert.equal(registrations,1);
  await assert.rejects(invoke(dispatcher,{timeUs:.5,durationUs:1}),/time_invalid/);await assert.rejects(invoke(dispatcher,{timeUs:0,durationUs:1,ease:'arbitrary-expression'}),/ease_unknown/);
  await assert.rejects(dispatcher({tool:{...tool,plugin_key:'wrong'},args:{timeUs:0,durationUs:1},context:{accountId:'a'}}),/not_enabled/);
  assert.equal((await listPlugins(db,{accountId:'a'}))[0].capabilities.length,2);assert.equal(GSAP_CREATIVE_PLUGIN.config.enabledModules.length,0);
 }finally{db.sqlite.close();}
});


test('plugin transport supplies the default dispatcher and explicit tool lanes override it',()=>{
 assert.equal(resolvePluginDispatchTarget({plugin_key:'remote',plugin_transport:'remote_jsonrpc',dispatch_target:'internal'}),'mcp');
 assert.equal(resolvePluginDispatchTarget({plugin_key:'native',plugin_transport:'native',dispatch_target:'internal'}),'native');
 assert.equal(resolvePluginDispatchTarget({plugin_key:'cf',plugin_transport:'iam_mcp_catalog',dispatch_target:'codemode'}),'codemode');
 assert.equal(resolvePluginDispatchTarget({plugin_key:'native',plugin_transport:'native',handler_config:{dispatch_target_override:'internal'}}),'internal');
});

test('tool-call telemetry records blocked outcomes, failure origin and observed cost',async()=>{
 const db=dbFixture();try{
  await installGSAPCreativePlugin(db,{accountId:'telemetry-account'});
  const [tool]=await listPluginTools(db,{accountId:'telemetry-account'});
  const blockedRuntime=createPluginRuntime({
   tools:[{...tool,requires_approval:1}],accountId:'telemetry-account',db,
   resolveCost:async()=>({costUsd:0.012,costBasis:'api_metered'}),
   dispatchers:{native:async()=>{throw new Error('must not dispatch before approval');}},
  });
  await assert.rejects(blockedRuntime.execute('gsap-creative.sample',{timeUs:0,durationUs:1},{accountId:'telemetry-account'}),/not_approved/);
  const blocked=await db.prepare('SELECT status,failure_origin,cost_usd,cost_basis FROM agentsam_tool_call_log ORDER BY rowid DESC LIMIT 1').bind().first();
  assert.equal(blocked.status,'blocked');
  assert.equal(blocked.failure_origin,'policy');
  assert.equal(blocked.cost_usd,0.012);
  assert.equal(blocked.cost_basis,'api_metered');

  const failedRuntime=createPluginRuntime({
   tools:[tool],accountId:'telemetry-account',db,
   resolveCost:async()=>({costUsd:0.004,costBasis:'api_metered'}),
   dispatchers:{native:async()=>{const error=new Error('provider unavailable');error.failureOrigin='provider';throw error;}},
  });
  await assert.rejects(failedRuntime.execute('gsap-creative.sample',{timeUs:0,durationUs:1},{accountId:'telemetry-account'}),/provider unavailable/);
  const failed=await db.prepare('SELECT status,failure_origin,cost_usd,cost_basis FROM agentsam_tool_call_log ORDER BY rowid DESC LIMIT 1').bind().first();
  assert.equal(failed.status,'error');
  assert.equal(failed.failure_origin,'provider');
  assert.equal(failed.cost_usd,0.004);
  assert.equal(failed.cost_basis,'api_metered');
 }finally{db.sqlite.close();}
});
