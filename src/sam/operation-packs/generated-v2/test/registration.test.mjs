import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeneratedSamOperations, validateSamInput } from '../operation-pack.js';
import { OPERATION_CATALOG } from '../catalog.js';
const identity = { accountId:'acct_a', actorId:'au_a',installationId:'install_a' };
function makePack(opts={}) {
  const registry=new Map();
  const info=createGeneratedSamOperations({
    defineSamOperation: x => x,
    registerSamOperation: x => registry.set(x.id,x),
    getSamOperation: x => registry.get(x),
    resolveTrustedContext:async()=>identity,
    authorize:async()=>true,
    handlers: opts.handlers || {},
  });
  return {registry,info};
}
test('all catalog names unique, including canonical image background remove',()=>{
  const names=OPERATION_CATALOG.map(x=>x.name);
  assert.equal(names.length,new Set(names).size);
  assert.ok(names.includes('media.image.background.remove'));
  assert.ok(names.includes('media.image.generate'));
  assert.ok(names.includes('media.image.edit'));
});
test('only bound domain tools are registered, no magical Bash dependency',async()=>{
  const {registry,info}=makePack({handlers:{'cms.page.inspect':async()=>({ok:true,id:'p'})}});
  assert.deepEqual([...registry.keys()],['cms.page.inspect']);
  assert.ok(info.unavailable.some(x=>x.name==='sam.superbash'&&x.reason==='handler_not_bound'));
  assert.equal((await registry.get('cms.page.inspect').handler({pageId:'x'},{})).id,'p');
});
test('sam.superbash requires exactly one source, not both',()=>{
  const schema=OPERATION_CATALOG.find(x=>x.name==='sam.superbash').input_schema;
  assert.throws(()=>validateSamInput({},schema),/exactly_one_source/);
  assert.throws(()=>validateSamInput({script:'echo hello',scriptArtifactRef:'s1'},schema),/exactly_one_source/);
  assert.doesNotThrow(()=>validateSamInput({script:'echo hello'},schema));
});
test('auth controls execution and handles are not promoted to success',async()=>{
  const {registry}=makePack({handlers:{'cms.page.inspect':async()=>({ok:false,error:'failed'})}});
  await assert.rejects(registry.get('cms.page.inspect').handler({pageId:'a'},{}),/failed/);
  await assert.rejects(registry.get('cms.page.inspect').handler({pageId:'a',accountId:'other'},{}),/unknown_field/);
});
test('denied authorization prevents executor call',async()=>{
  let called=false; const registry=new Map();
  createGeneratedSamOperations({defineSamOperation:x=>x,registerSamOperation:x=>registry.set(x.id,x),
    resolveTrustedContext:async()=>identity,authorize:async()=>false,
    handlers:{'cms.page.inspect':async()=>{called=true;return {};}}});
  await assert.rejects(registry.get('cms.page.inspect').handler({pageId:'1'},{}),/denied/);
  assert.equal(called,false);
});
