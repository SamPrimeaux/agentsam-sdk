import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCmsOperations,CMS_OPERATION_CONTRACTS} from '../src/index.js';
import {createCmsMemoryRepository} from './support/memory-repository.mjs';

const principal={accountId:'a',installationId:'i',actorId:'u'};
const makeOperations=({repository,definitions=[]})=>createCmsOperations({
  defineSamOperation:x=>x,
  repository,
  definitions,
  resolveTrustedContext:async()=>principal,
  authorize:async()=>true,
});

test('package runs with an injected host repository without SQL',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'sam-cms-packaged-'));
  let db;
  try{
    db=await createCmsMemoryRepository();
    const operations=makeOperations({repository:db});
    assert.equal(CMS_OPERATION_CONTRACTS.length,13);
    assert.equal(operations.length,25);
    const byName=new Map(operations.map(o=>[o.id,o]));
    const created=await byName.get('cms.page.createDraft').handler({pageId:'home',title:'Home',slug:'home'},{});
    assert.equal(created.version,1);
    const preview=await byName.get('cms.page.preview').handler({pageId:'home'},{});
    assert.equal(preview.published,false);
    assert.equal(preview.digest.length,64);
    assert.equal(db.getPublication(principal,'home'),null);
  }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

test('CMS operation declarations use shared portable metadata and keep CMS effects local',()=>{
  assert.equal(CMS_OPERATION_CONTRACTS.length,13);
  const inspect=CMS_OPERATION_CONTRACTS.find(contract=>contract.id==='cms.resource.inspect');
  assert.equal(inspect.module,'cms');
  assert.equal(inspect.capabilities[0],'cms.resource.read');
  assert.deepEqual(inspect.input_schema.required,['pageId']);
  assert.equal(inspect.effect,'read');
  assert.equal(inspect.execution.sideEffects,'none');
  const publish=CMS_OPERATION_CONTRACTS.find(contract=>contract.id==='cms.page.publish');
  assert.equal(publish.risk,'privileged');
  assert.equal(publish.execution.sideEffects,'deploy');
  assert.equal(publish.idempotencyMode,'supported');
  assert.equal(inspect.name,inspect.id);
  assert.equal(inspect.capability,inspect.capabilities[0]);
});

test('component traversal, mutation and inspection support nested blocks',async()=>{
  const db=await createCmsMemoryRepository();
  try{
    const definitions=[
      {kind:'section',key:'hero',version:1,status:'active',settings_schema:{type:'object',additionalProperties:true},allowedBlocks:['group']},
      {kind:'block',key:'group',version:1,status:'active',settings_schema:{type:'object',additionalProperties:true},allowedBlocks:['heading']},
      {kind:'block',key:'heading',version:1,status:'active',settings_schema:{type:'object',additionalProperties:true}},
    ];
    const operations=makeOperations({repository:db,definitions});
    const byName=new Map(operations.map(o=>[o.id,o]));
    await byName.get('cms.page.createDraft').handler({pageId:'home',title:'Home',slug:'home'},{});
    const section=await byName.get('cms.component.create').handler({
      pageId:'home',expectedVersion:1,kind:'section',definitionKey:'hero',settings:{}
    },{});
    const group=await byName.get('cms.component.create').handler({
      pageId:'home',expectedVersion:2,kind:'block',definitionKey:'group',parentId:section.componentId,settings:{}
    },{});
    const heading=await byName.get('cms.component.create').handler({
      pageId:'home',expectedVersion:3,kind:'block',definitionKey:'heading',parentId:group.componentId,settings:{text:'Hello'}
    },{});
    const inspected=await byName.get('cms.resource.inspect').handler({
      pageId:'home',componentId:heading.componentId
    },{});
    assert.equal(inspected.resource.definitionKey,'heading');
    const updated=await byName.get('cms.component.update').handler({
      pageId:'home',componentId:heading.componentId,expectedVersion:4,patch:{text:'Nested block'}
    },{});
    assert.equal(updated.version,5);
    const inspectedAgain=await byName.get('cms.resource.inspect').handler({
      pageId:'home',componentId:heading.componentId
    },{});
    assert.equal(inspectedAgain.resource.settings.text,'Nested block');
    await assert.rejects(
      byName.get('cms.resource.inspect').handler({componentId:heading.componentId},{}),
      error=>error.code==='cms_schema_required'
    );
  }finally{db.close();}
});
