import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateProject,applyProjectOperation} from '../src/lib/cad/project-contract.js';
import {FileProjectStore} from '../src/lib/cad/project-store.js';
import {createProjectRuntime} from '../src/lib/cad/project-runtime.js';
import {projectToBlenderRecipe} from '../src/lib/cad/project-recipe.js';
import {createCapabilityAdapter} from '../src/agent/capability-adapter.js';
const project=JSON.parse(fs.readFileSync(new URL('./fixtures/cad/courtyard-house.json',import.meta.url),'utf8'));
test('invalid references and non-finite geometry fail before mutation',()=>{
 const p=structuredClone(project);p.walls[0].x1=Infinity;assert.equal(validateProject(p).valid,false);
 p.walls[0].x1=0;p.doors[0].wallId='missing';assert.equal(validateProject(p).valid,false);
 assert.equal(validateProject({...p,walls:{}}).valid,false);
});
test('batch is atomic, absent targets fail, and host deletion cascades',()=>{
 const before=JSON.stringify(project);
 assert.throws(()=>applyProjectOperation(project,{type:'batch_operations',operations:[{type:'delete_wall',wallId:'wall-4'},{type:'update_wall',wallId:'absent',updates:{height3D:96}}]}),/element_not_found/);
 assert.equal(JSON.stringify(project),before);
 assert.equal(applyProjectOperation(project,{type:'delete_wall',wallId:'wall-4'}).doors.length,0);
});
test('save reopen restore and stale revision checks preserve immutable snapshots',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cad-project-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new FileProjectStore(dir);
 await store.save(project,0);
 const next=applyProjectOperation(project,{type:'update_wall',wallId:'wall-0',updates:{height3D:132}});
 await store.save(next,1);
 await assert.rejects(store.save(project,1),/revision_conflict/);
 const restored=await new FileProjectStore(dir).restore(project.id,1,2);
 assert.equal(restored.revision,3);assert.equal(restored.project.walls[0].height3D,120);assert.equal((await store.read(project.id,2)).project.walls[0].height3D,132);
});
test('native recipe converts inches to metres and preserves a real door gap',()=>{
 const recipe=projectToBlenderRecipe(project);
 assert.equal(recipe.operations.find(o=>o.name==='wall-0:0').scale[0],864*0.0254);
 const pieces=recipe.operations.filter(o=>o.name?.startsWith('wall-4:'));
 assert.equal(pieces.length,3);
 assert.throws(()=>projectToBlenderRecipe({...project,roofType:'gable'}),/roof_geometry_not_supported/);
});
test('agent and runtime share executable CAD handlers',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cad-agent-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const adapter=createCapabilityAdapter({projectRoot:root});
 assert.ok(adapter.toolDescriptors().some(t=>t.name==='design_project_save'));
 await adapter.invoke('design_project_save',{project,expected_revision:0});
 const result=await adapter.invoke('design_apply_operation',{project_id:project.id,expected_revision:1,operation:{type:'update_wall',wallId:'wall-0',updates:{height3D:132}}});
 assert.equal(result.result.revision,2);
});
