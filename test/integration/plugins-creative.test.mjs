import assert from 'node:assert/strict';import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {GSAP_CREATIVE_PLUGIN,installGSAPCreativePlugin,createGSAPCreativeDispatcher} from '../../src/plugins/creative.js';
import {listPlugins,listPluginTools,updatePluginPreferences} from '../../src/plugins/registry.js';
import {createPluginRuntime} from '../../src/plugins/runtime.js';
function dbFixture() {
 const sqlite = new DatabaseSync(':memory:');
 sqlite.exec(readFileSync(new URL('../../migrations/d1/0001_agentsam_plugin_runtime.sql', import.meta.url), 'utf8'));
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
  const tools=await listPluginTools(db,{accountId:'user-a'});assert.equal(tools[0].plugin_id,installed.plugin_id);
  const runtime=createPluginRuntime({tools,dispatchers:{native:createGSAPCreativeDispatcher({db,gsap})}});
  const sample=await runtime.execute('gsap-creative.sample',{timeUs:500000,durationUs:1000000},{accountId:'user-a'});assert.equal(sample.value,.875);
  await assert.rejects(runtime.execute('gsap-creative.sample',{timeUs:500000,durationUs:1000000},{accountId:'user-b'}),/not_enabled/);
  await updatePluginPreferences(db,{accountId:'user-a',pluginId:installed.plugin_id,enabled:false});
  await assert.rejects(runtime.execute('gsap-creative.sample',{timeUs:0,durationUs:1},{accountId:'user-a'}),/not_enabled/);
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
  await assert.rejects(dispatcher({tool:{...tool,plugin_id:'wrong'},args:{timeUs:0,durationUs:1},context:{accountId:'a'}}),/not_enabled/);
  assert.equal((await listPlugins(db,{accountId:'a'}))[0].capabilities.length,2);assert.equal(GSAP_CREATIVE_PLUGIN.config.enabledModules.length,0);
 }finally{db.sqlite.close();}
});
