import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const root=new URL('../../',import.meta.url).pathname;
async function moduleAt(path){
 const output=await build({absWorkingDir:root,entryPoints:[path],bundle:true,write:false,format:'esm',platform:'node',target:'es2022'});
 return import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
}
const {createSamSketchDesignAdapter,documentRevision,validateSketchPatch}=await moduleAt('apps/samsketch/src/design-adapter.ts');
const {patchCadSceneElement}=await moduleAt('apps/cad-creator/frontend/src/lib/design-workspace-adapter.ts');
const scope={contract:'agentsam.resource-scope.v2',accountId:'owner',authUserId:'owner'};
function scene(){return {version:1,name:'Editable scene',brand:'agentsam',chapter:0,items:[
 {id:'assembly',name:'Assembly',kind:'template',position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',material:'clay',visible:true},
 {id:'sibling',name:'Sibling',kind:'box',position:[1,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#ffffff',material:'clay',visible:true} ]};}
async function harness(){
 let doc=scene(),saved=await documentRevision(doc),selection=[];
 const engine={document:()=>doc,id:()=> 'sketch_123456789012',savedHash:()=>saved,selection:()=>selection,parts:()=>['mesh-a','mesh-b'],
 load:(_id,hash,value)=>{doc=value;saved=hash;},select:targets=>{selection=targets;},
 modify:(id,part,patch)=>{const item=doc.items.find(x=>x.id===id);if(part){item.partOverrides??={};item.partOverrides[part]={...item.partOverrides[part],...patch};}else Object.assign(item,patch);},
 undo:()=>{},redo:()=>{},save:async()=>{saved=await documentRevision(doc);}};
 return {engine,adapter:createSamSketchDesignAdapter(engine)};
}
test('SamSketch exact part change leaves parent transform and siblings intact',async()=>{
 const {engine,adapter}=await harness(),before=structuredClone(engine.document()),revision=await documentRevision(before);
 const receipt=await adapter.execute(scope,{id:'op-part',resourceId:engine.id(),kind:'modify',expectedRevision:revision,selection:[{id:'mesh-a',kind:'source-part',parentId:'assembly'}],payload:{position:[3,4,5],color:'#334455'}});
 assert.equal(receipt.status,'applied');assert.notEqual(receipt.revision,revision);
 assert.deepEqual(engine.document().items[0].position,before.items[0].position);
 assert.deepEqual(engine.document().items[1],before.items[1]);
 assert.deepEqual(engine.document().items[0].partOverrides['mesh-a'],{position:[3,4,5],color:'#334455'});
 assert.equal(engine.document().items[0].partOverrides['mesh-b'],undefined);
 await assert.rejects(adapter.execute(scope,{id:'stale',resourceId:engine.id(),kind:'modify',expectedRevision:revision,selection:[{id:'assembly',kind:'template'}],payload:{visible:false}}),/revision_conflict/);
});
test('SamSketch refuses unknown parts and unsupported patches before changing a document',async()=>{
 const {engine,adapter}=await harness(),original=JSON.stringify(engine.document()),expectedRevision=await documentRevision(engine.document());
 await assert.rejects(adapter.execute(scope,{id:'bad',resourceId:engine.id(),kind:'modify',expectedRevision,selection:[{id:'unknown',kind:'source-part',parentId:'assembly'}],payload:{color:'#000000'}}),/selection_not_found/);
 for(const payload of [{id:'hijack'},{position:[1,2,Infinity]},{color:'url(javascript:bad)'},{visible:'false'}])assert.throws(()=>validateSketchPatch(payload),/patch_invalid/);
 assert.equal(JSON.stringify(engine.document()),original);
});
test('SamSketch open enforces the account-owned API and detects an advanced saved revision',async()=>{
 const {engine,adapter}=await harness(),previous=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({ok:false,error:'scene_not_found'},{status:404});
  await assert.rejects(adapter.open(scope,engine.id()),/scene_not_found/);
  globalThis.fetch=async()=>Response.json({ok:true,scene:{contentHash:'advanced'},document:scene()});
  await assert.rejects(adapter.open(scope,engine.id()),/revision_conflict/);
 }finally{globalThis.fetch=previous;}
});
test('CAD scene adapter changes one real scene element and refuses native geometry fields',()=>{
 const project={id:'project',sceneElements:[{id:'mesh-a',name:'Wall',offset:[0,0,0],rotation:0,visible:true},{id:'mesh-b',name:'Roof',offset:[0,0,0],rotation:0,visible:true}]};
 const next=patchCadSceneElement(project,'mesh-a',{offset:[1,2,3],color:'#445566'});
 assert.deepEqual(next.sceneElements[1],project.sceneElements[1]);
 assert.deepEqual(project.sceneElements[0].offset,[0,0,0]);
 assert.deepEqual(next.sceneElements[0].offset,[1,2,3]);
 assert.throws(()=>patchCadSceneElement(project,'mesh-a',{wallThickness:12}),/patch_invalid/);
 assert.throws(()=>patchCadSceneElement(project,'missing',{visible:false}),/scene_element_required/);
});
