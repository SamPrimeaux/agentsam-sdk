import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { AgentSamClient, createSamOS, createSamCapabilityAdapter } from '../../src/sam/index.js';
import { createNodeSqliteCmsRepository } from '../../src/sam/packs/cms/node.js';
import { buildAgentToolSurface } from '../../src/agent/responses-runner.js';

const definitions=[
  {key:'hero',kind:'section',version:1,status:'active',allowedBlocks:['cta'],settings_schema:{
    type:'object',properties:{
      heading:{type:'string',minLength:1},tone:{type:'string',enum:['light','dark']},
      padding:{type:'integer',minimum:0,maximum:200},
    },required:['heading'],additionalProperties:false,
  }},
  {key:'cta',kind:'block',version:1,status:'active',settings_schema:{
    type:'object',properties:{label:{type:'string',minLength:1},url:{type:'string',minLength:1}},
    required:['label','url'],additionalProperties:false,
  }},
];
const principal={actorId:'au_owner',accountId:'acctA',installationId:'storeA'};
const other={actorId:'au_other',accountId:'acctB',installationId:'storeB'};
const cmsOptions=(repository,identity=principal,auth=()=>true)=>({
  repository,definitions,resolveTrustedContext:async()=>identity,
  authorize:async({operation})=>operation==='cms.page.publish'
    ? (auth(operation) ? {allow:true,publicationApproved:true}:false)
    : auth(operation),
});

test('SDK CMS machine: real SQLite lifecycle, revisions, schema validation, private preview, immutable publish and tenant isolation',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'sam-cms-machine-'));
  let db;
  try {
    const filename=path.join(root,'data.sqlite');
    db=await createNodeSqliteCmsRepository({filename});
    const osRuntime=createSamOS({core:false,cms:cmsOptions(db)});
    assert.equal(osRuntime.status().available.length,25);
    const sam=new AgentSamClient({os:osRuntime});
    const invoke=(id,input)=>sam.invoke(id,input);
    assert.equal((await sam.describe('cms.component.update')).ok,true);
    const discovered=await sam.discover({query:'cms component update'});
    assert.ok(discovered.operations.some(op=>op.id==='cms.component.update'));

    const defs=await invoke('cms.definition.list',{});
    assert.equal(defs.ok,true);
    assert.deepEqual(defs.data.definitions.map(d=>d.key),['hero','cta']);

    const page=await invoke('cms.page.createDraft',{pageId:'home',title:'Homepage',slug:'home',idempotencyKey:'initial-home'});
    assert.equal(page.ok,true,JSON.stringify(page.error));
    assert.equal(page.data.version,1);

    const section=await invoke('cms.component.create',{pageId:'home',expectedVersion:1,kind:'section',
      definitionKey:'hero',settings:{heading:'Original heading',tone:'light'}});
    assert.equal(section.ok,true,JSON.stringify(section.error));
    const heroId=section.data.componentId;
    assert.ok(heroId.startsWith('cmp_'));
    assert.equal(section.data.version,2);

    const missingVersion=await invoke('cms.component.update',{pageId:'home',componentId:heroId,patch:{heading:'Not saved'}});
    assert.equal(missingVersion.ok,false);
    const invalid=await invoke('cms.component.update',{pageId:'home',componentId:heroId,expectedVersion:2,patch:{unexpected:'bad'}});
    assert.equal(invalid.ok,false);
    assert.match(invalid.error.message,/cms_schema_unknown_field/);
    const conflict=await invoke('cms.component.update',{pageId:'home',componentId:heroId,expectedVersion:1,patch:{heading:'stale'}});
    assert.equal(conflict.ok,false);
    assert.equal(conflict.error.code,'cms_version_conflict');

    const updated=await invoke('cms.component.update',{pageId:'home',componentId:heroId,expectedVersion:2,patch:{heading:'Updated heading'}});
    assert.equal(updated.ok,true,JSON.stringify(updated.error));
    assert.equal(updated.data.version,3);

    const added=await invoke('cms.component.create',{pageId:'home',expectedVersion:3,kind:'block',definitionKey:'cta',
      parentId:heroId,settings:{label:'Shop',url:'/shop'}});
    assert.equal(added.ok,true,JSON.stringify(added.error));
    const blockId=added.data.componentId;

    const copied=await invoke('cms.component.duplicate',{pageId:'home',componentId:heroId,expectedVersion:4});
    assert.equal(copied.ok,true,JSON.stringify(copied.error));
    const nextId=copied.data.componentId;
    assert.notEqual(nextId,heroId);

    const reordered=await invoke('cms.component.reorder',{pageId:'home',componentId:nextId,expectedVersion:5,targetIndex:0});
    assert.equal(reordered.ok,true,JSON.stringify(reordered.error));

    const removed=await invoke('cms.component.remove',{pageId:'home',componentId:blockId,expectedVersion:6});
    assert.equal(removed.ok,true);
    const preview=await invoke('cms.page.preview',{pageId:'home'});
    assert.equal(preview.ok,true);
    assert.equal(preview.data.published,false);
    assert.equal(preview.data.document.sections.length,2);
    assert.equal(preview.data.version,7);
    assert.ok(!preview.data.document.sections[1].blocks.some(b=>b.id===blockId));

    const history=await invoke('cms.revision.history',{pageId:'home'});
    assert.equal(history.ok,true);
    assert.equal(history.data.revisions.length,7);
    const restored=await invoke('cms.revision.restore',{pageId:'home',expectedVersion:7,revision:6});
    assert.equal(restored.ok,true,JSON.stringify(restored.error));
    assert.equal(restored.data.version,8);
    assert.ok((await invoke('cms.resource.inspect',{pageId:'home'})).data.page.sections[1].blocks.some(b=>b.id===blockId));

    const noConfirm=await invoke('cms.page.publish',{pageId:'home',expectedVersion:8,confirmation:false});
    assert.equal(noConfirm.ok,false);
    assert.equal(db.getPublication(principal,'home'),null);
    // Generic authorization is not enough for live publish.
    const unapprovedOS=createSamOS({core:false,cms:{
      repository:db,definitions,resolveTrustedContext:async()=>principal,
      authorize:async()=>true,
    }});
    const missingApproval=await new AgentSamClient({os:unapprovedOS}).invoke(
      'cms.page.publish',{pageId:'home',expectedVersion:8,confirmation:true});
    assert.equal(missingApproval.ok,false);
    assert.equal(missingApproval.error.code,'cms_publish_approval_required');
    assert.equal(db.getPublication(principal,'home'),null);
    const published=await invoke('cms.page.publish',{pageId:'home',expectedVersion:8,confirmation:true});
    assert.equal(published.ok,true,JSON.stringify(published.error));
    assert.equal(published.data.publishedVersion,8);
    const pubBefore=db.getPublication(principal,'home');
    assert.equal(pubBefore.document.version,8);
    assert.equal(pubBefore.document.sections[1].settings.heading,'Updated heading');

    const visible=await invoke('cms.component.visibility',{pageId:'home',componentId:heroId,expectedVersion:9,visible:false});
    assert.equal(visible.ok,true);
    const pubAfter=db.getPublication(principal,'home');
    assert.deepEqual(pubAfter,pubBefore,'draft mutation must not change immutable live snapshot');

    const surface=createSamCapabilityAdapter({os:osRuntime,expose:['cms.definition.list','cms.component.update','cms.page.publish'],
      authorize:async({operation})=>operation!=='cms.page.publish'});
    assert.deepEqual(surface.toolDescriptors().map(x=>x.name),['cms.component.update','cms.definition.list','cms.page.publish']);
    // A privileged tool is still explicitly exposed but can be denied at invocation:
    const policyDenied=await surface.invoke('cms.page.publish',{pageId:'home',expectedVersion:10,confirmation:true});
    assert.equal(policyDenied.ok,false);

    // The local adapter must materialize the existing CMS runtime tables,
    // without adding a parallel family of SAM CMS storage tables.
    const {DatabaseSync}=await import('node:sqlite');
    const rawDb=new DatabaseSync(filename);
    try {
      assert.equal(rawDb.prepare('SELECT COUNT(*) AS n FROM cms_pages').get().n,1);
      assert.equal(rawDb.prepare('SELECT COUNT(*) AS n FROM cms_sections').get().n,2);
      assert.equal(rawDb.prepare('SELECT COUNT(*) AS n FROM cms_blocks').get().n,2);
      assert.equal(rawDb.prepare('SELECT COUNT(*) AS n FROM cms_publications').get().n,1);
      const parallel=rawDb.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'sam_cms_%'").all();
      assert.deepEqual(parallel,[]);
    } finally {rawDb.close();}

    db.close();db=null;
    const reopened=await createNodeSqliteCmsRepository({filename});
    db=reopened;
    assert.equal(db.readPage(principal,'home').version,10);
    assert.equal(db.getPublication(principal,'home').version,8);
    assert.equal(db.readPage(other,'home'),null);
    const otherOs=createSamOS({core:false,cms:cmsOptions(db,other)});
    const otherRead=await new AgentSamClient({os:otherOs}).invoke('cms.resource.inspect',{pageId:'home'});
    assert.equal(otherRead.ok,false);
    assert.equal(otherRead.error.code,'cms_page_not_found');
  } finally {db?.close();await rm(root,{recursive:true,force:true});}
});

test('CMS idempotency and optimistic concurrency are transactionally enforced across SQLite connections',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'sam-cms-cas-'));
  let a,b;
  try {
    const filename=path.join(root,'cms.sqlite');
    a=await createNodeSqliteCmsRepository({filename});
    b=await createNodeSqliteCmsRepository({filename});
    const input={pageId:'home',title:'Home',slug:'home',idempotencyKey:'page-home-1'};
    assert.equal(a.createPage(principal,input).document.version,1);
    assert.equal(b.createPage(principal,input).duplicate,true);
    const osA=createSamOS({core:false,cms:cmsOptions(a)});
    const osB=createSamOS({core:false,cms:cmsOptions(b)});
    const payload={pageId:'home',expectedVersion:1,kind:'section',definitionKey:'hero',
      settings:{heading:'Safe'},idempotencyKey:'same-creation-request'};
    const first=await new AgentSamClient({os:osA}).invoke('cms.component.create',payload);
    assert.equal(first.ok,true);
    const retry=await new AgentSamClient({os:osB}).invoke('cms.component.create',payload);
    assert.equal(retry.ok,true);
    assert.equal(retry.data.componentId,first.data.componentId);
    const collision=await new AgentSamClient({os:osB}).invoke('cms.component.create',{...payload,settings:{heading:'Different'}});
    assert.equal(collision.ok,false);
    assert.equal(collision.error.code,'cms_idempotency_key_conflict');
    assert.equal(a.readPage(principal,'home').sections.length,1);
  }finally{a?.close();b?.close();await rm(root,{recursive:true,force:true});}
});

test('old section/block operation names execute canonical SDK machinery without duplicate model tools',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'sam-cms-legacy-'));
  let db;
  try {
    db=await createNodeSqliteCmsRepository({filename:path.join(dir,'cms.sqlite')});
    const osRuntime=createSamOS({core:false,cms:cmsOptions(db)});
    const client=new AgentSamClient({os:osRuntime});
    const call=(id,input)=>client.invoke(id,input);
    const page=await call('cms.page.createDraft',{pageId:'case',title:'Case',slug:'case'});
    assert.equal(page.ok,true);
    const created=await call('cms.section.create',{pageId:'case',expectedVersion:1,
      definitionKey:'hero',settings:{heading:'Legacy section'}});
    assert.equal(created.ok,true,JSON.stringify(created.error));
    const sectionId=created.data.componentId;
    const edited=await call('cms.section.updateDraft',{
      pageId:'case',sectionId,expectedVersion:2,settings:{heading:'Updated via alias'}});
    assert.equal(edited.ok,true,JSON.stringify(edited.error));
    const added=await call('cms.block.add',{
      pageId:'case',sectionId,expectedVersion:3,definitionKey:'cta',
      settings:{label:'Visit',url:'/visit'}});
    assert.equal(added.ok,true,JSON.stringify(added.error));
    const section=await call('cms.section.inspect',{pageId:'case',sectionId});
    assert.equal(section.data.resource.settings.heading,'Updated via alias');
    assert.equal(section.data.resource.blocks[0].settings.label,'Visit');
    const unknown=await call('cms.section.updateDraft',{
      pageId:'case',sectionId,expectedVersion:4,settings:{heading:'bad'},accountId:'injected'});
    assert.equal(unknown.ok,false);
    assert.match(unknown.error.message,/cms_alias_unknown_field/);
    const permitted=osRuntime.list().map(x=>x.id);
    const adapter=createSamCapabilityAdapter({os:osRuntime,expose:permitted,authorize:async()=>true});
    const names=adapter.toolDescriptors().map(x=>x.name);
    assert.equal(names.length,13,'only canonical CMS operations should be in model tools');
    assert.ok(!names.includes('cms.section.updateDraft'));
    assert.ok(names.includes('cms.component.update'));
  }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});


test('portable CMS package pins the authoritative SDK cms-runtime schema verbatim',async()=>{
  const [original,packaged]=await Promise.all([
    readFile(new URL('../../packages/cms-runtime/schemas/sqlite/cms-local-runtime.v1.sql',import.meta.url)),
    readFile(new URL('../../packages/agentsam-cms/src/schema/cms-local-runtime.v1.sql',import.meta.url)),
  ]);
  assert.deepEqual(packaged,original);
});
