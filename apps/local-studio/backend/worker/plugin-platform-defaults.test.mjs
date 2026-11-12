import test from 'node:test';
import assert from 'node:assert/strict';
import {projectPlatformPluginDefinitions} from './plugin-discovery.js';

const entry=(key,metadata,installed=0,enabled=0)=>({
  plugin_key:key,display_name:key,description:'Registered platform definition',
  plugin_kind:'native',category:'workspace',version:'1.0.0',provider_key:'agentsam',
  capabilities_json:'["canvas","design"]',metadata_json:JSON.stringify(metadata),
  installations:installed,enabled,setup_status:installed?'configured':null,
});
test('first-party defaults expose definitions without fabricating user installations or tool execution',()=>{
  const rows=[
    entry('agentsam-stage-canvas',{side_stage:{renderer:'builtin'}},1,1),
    entry('agentsam-stage-cad',{app:{nav:{href:'/cad'}}}),
    entry('future-plugin',{}),
  ];
  const definitions=projectPlatformPluginDefinitions(rows,[]);
  assert.equal(definitions.length,3);
  assert.equal(definitions[0].surface,'side_stage');
  assert.equal(definitions[1].surface,'app');
  assert.equal(definitions[1].installed,false);
  assert.equal(definitions[1].readiness,'definition_only');
  assert.equal(definitions[2].surface,'integration');
  assert.equal(projectPlatformPluginDefinitions(rows,[{plugin_key:'future-plugin'}])[2].readiness,'tools_registered');
  assert.equal(projectPlatformPluginDefinitions(rows,[{plugin_key:'other'}])[2].readiness,'definition_only');
});
