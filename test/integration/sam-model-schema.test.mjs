import test from 'node:test';
import assert from 'node:assert/strict';
import { createSamOS } from '../../src/sam/os.js';
import { AgentSamClient } from '../../src/sam/client.js';
import { createSamCapabilityAdapter } from '../../src/sam/model-adapter.js';

test('registered repository inspect schema is accurate and exposed through the authorized model adapter', async () => {
  const os = createSamOS({ core: true });
  const inspected = os.get('repository.inspect');
  assert.equal(inspected.input_schema.type, 'object');
  assert.equal(inspected.input_schema.properties.root.type, 'string');
  assert.equal(inspected.input_schema.properties.cwd.type, 'string');
  assert.equal(inspected.input_schema.properties.churnDays.type, 'integer');
  assert.equal(inspected.input_schema.additionalProperties, false);
  assert.ok(!('output_schema' in inspected), 'no misleading output schema');
  let approvals = 0;
  const adapter = createSamCapabilityAdapter({
    os, client: new AgentSamClient({ os, cwd: '/tmp' }),
    expose: ['repository.inspect', 'terminal.exec'],
    authorize: async ({operation}) => { approvals++; return operation === 'repository.inspect'; },
  });
  const descriptors = adapter.toolDescriptors();
  assert.deepEqual(descriptors.map(d=>d.name), ['repository.inspect']);
  assert.deepEqual(Object.keys(descriptors[0].input_schema.properties).sort(), ['churnDays','cwd','root']);
  assert.equal(adapter.canInvoke('repository.inspect'), true);
  assert.equal(adapter.canInvoke('terminal.exec'), false, 'no model schema means not callable');
  const denied = await createSamCapabilityAdapter({
    os, expose: ['repository.inspect'], authorize: async ()=>false,
  }).invoke('repository.inspect', {root:'/tmp'});
  assert.equal(denied.error, 'sam_tool_not_authorized');
  assert.equal(approvals, 0);
});

test('model adapter never treats incomplete shape or schema-file path as a callable JSON schema', () => {
  const os = createSamOS({ core:false });
  os.install([{
    id:'fixture.path', module:'fixture', action:'path', summary:'fixture',
    execution:{lanes:['local'],model:'never',network:'none',sideEffects:'none'},
    risk:'read_only', input_schema:'protocol/capabilities/fixture.json',
    handler:async()=>({ok:true}),
  }]);
  const adapter=createSamCapabilityAdapter({os,expose:['fixture.path'],authorize:async()=>true});
  assert.equal(adapter.canInvoke('fixture.path'),false);
  assert.deepEqual(adapter.toolDescriptors(),[]);
});
