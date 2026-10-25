import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {FileProjectStore} from '../../src/lib/cad/project-store.js';
import {createProjectRuntime} from '../../src/lib/cad/project-runtime.js';
import {localProjectRuntime} from '../../src/lib/cad/project-cli.js';

function fixture(id) {
 const p=JSON.parse(fs.readFileSync(new URL('../fixtures/cad/courtyard-house.json',import.meta.url),'utf8'));
 p.id=id;
 p.parametricObjects=[{id:'native_box',name:'Native solid',generator:'occt',generatorTemplate:'box',
  parameters:{width:10,depth:10,height:10},transform:{x:0,y:0,z:0},source:'occt:box'}];
 return p;
}
function fakeProvider() {
 return {doctor:async()=>({ready:true,engine:'occt',version:'fixture'}),
  async execute(name,input,ctx) {
   if(name==='design_model_inspect')return {verified:true,volume_mm3:254**3};
   assert.equal(input.units,'in');
   const file=path.join(ctx.artifactRoot,'fixture-'+crypto.randomUUID()+'.step');
   fs.writeFileSync(file,'TEST ONLY: mock STEP receipt');
   return {verified:true,engine:'occt',native_version:'fixture',volume_mm3:254**3,
    artifact:{path:file,format:'step',size_bytes:fs.statSync(file).size,
     sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}};
  }};
}

test('CAD project binds native solid to revision, reopens and verifies STEP digest',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cad-occt-contract-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=createProjectRuntime({store:new FileProjectStore(path.join(root,'projects')),
  artifactRoot:path.join(root,'artifacts'),occt:fakeProvider()});
 const project=fixture('cad-occt-contract');
 const saved=await runtime.execute('design_project_save',{project,expected_revision:0});
 const request={project_id:project.id,revision:saved.revision};
 const built=await runtime.execute('design_model_build',{...request,engine:'occt',parametric_object_id:'native_box'});
 assert.equal(built.content_hash,saved.content_hash);
 assert.equal(built.parametric_object_id,'native_box');
 assert.equal(path.basename(built.artifact.path),'model.step');
 assert.deepEqual((await runtime.execute('design_model_build',{...request,engine:'occt',parametric_object_id:'native_box'})).artifact,built.artifact);
 const reopened=await runtime.execute('design_project_get',request);
 assert.equal(reopened.project.parametricObjects[0].parameters.width,10);
 assert.equal((await runtime.execute('design_model_inspect',{...request,engine:'occt'})).volume_mm3,254**3);
 assert.equal((await runtime.execute('design_model_export',{...request,format:'step'})).artifact.sha256,built.artifact.sha256);
 fs.appendFileSync(built.artifact.path,'tampered');
 await assert.rejects(runtime.execute('design_model_export',{...request,format:'step'}),/occt_step_digest_mismatch/);
});

test('CAD project rejects unregistered native primitives and unsafe dimensions',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cad-occt-invalid-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=createProjectRuntime({store:new FileProjectStore(path.join(root,'projects')),
  artifactRoot:path.join(root,'artifacts'),occt:fakeProvider()});
 const project=fixture('cad-occt-invalid');
 project.parametricObjects[0].parameters.width=0;
 const saved=await runtime.execute('design_project_save',{project,expected_revision:0});
 const args={project_id:project.id,revision:saved.revision,engine:'occt'};
 await assert.rejects(runtime.execute('design_model_build',{...args,parametric_object_id:'native_box'}),/occt_project_dimensions_invalid/);
 await assert.rejects(runtime.execute('design_model_build',{...args,parametric_object_id:'missing'}),/occt_project_primitive_required/);
 await assert.rejects(runtime.execute('design_model_export',{project_id:project.id,revision:saved.revision,format:'step'}),/occt_build_required/);
});

test('real CAD Creator project creates and reopens an OCCT STEP solid', {skip:process.env.AGENTSAM_TEST_OCCT_NATIVE!=='1'&&'Opt-in real kernel check'}, async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cad-occt-real-app-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=localProjectRuntime(root);
 assert.equal((await runtime.nativeDoctor()).ready,true);
 const p=fixture('cad-occt-native-'+Date.now());
 const saved=await runtime.execute('design_project_save',{project:p,expected_revision:0});
 const input={project_id:p.id,revision:saved.revision};
 const out=await runtime.execute('design_model_build',{...input,engine:'occt',parametric_object_id:'native_box'});
 assert.equal(out.verified,true);
 assert.ok(fs.statSync(out.artifact.path).size>0);
 assert.ok(Math.abs(out.volume_mm3-(254**3))<0.01);
 const inspection=await runtime.execute('design_model_inspect',{...input,engine:'occt'});
 assert.ok(Math.abs(inspection.volume_mm3-out.volume_mm3)<0.01);
 assert.equal((await runtime.execute('design_model_export',{...input,format:'step'})).artifact.sha256,out.artifact.sha256);
});

test('real saved feature history is reachable through agent build/export tools without changing project revision', {skip:process.env.AGENTSAM_TEST_OCCT_NATIVE!=='1'&&'Opt-in real kernel check'}, async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cad-native-features-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=localProjectRuntime(root);
 const p=fixture('cad-native-features');
 p.walls=[{id:'native-wall',x1:0,y1:0,x2:5000/25.4,y2:0,thickness:200/25.4,height3D:3000/25.4,material:'concrete'}];
 p.doors=[{id:'native-door',wallId:'native-wall',distanceAlongWall:.29,width:900/25.4,height:2100/25.4,swing:'left',openAngle:0}];
 p.windows=[];p.furniture=[];
 p.nativeHistory={version:1,cursor:1,operations:[{type:'$syncPlan',operations:[
  {id:'native-wall',type:'wall',start:[0,0],end:[5000,0],thickness:200,height:3000},
  {id:'native-door',type:'opening',host:'native-wall',offset:1000,width:900,height:2100}
 ]}]};
 const saved=await runtime.execute('design_project_save',{project:p,expected_revision:0});
 const input={project_id:p.id,revision:saved.revision,engine:'occt',element_id:'native-wall'};
 const built=await runtime.execute('design_model_build',input);
 assert.equal(built.verified,true);assert.ok(Math.abs(built.volume_mm3-2622000000)<.001);
 for(const format of ['step','brep','gltf','ifc']){
  const result=await runtime.execute('design_model_export',{...input,format});
  assert.equal(result.content_hash,saved.content_hash);
  const bytes=fs.readFileSync(result.artifact.path);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),result.artifact.sha256);
  assert.equal((await runtime.execute('design_model_export',{...input,format})).artifact.sha256,result.artifact.sha256);
 }
 assert.equal((await runtime.execute('design_project_get',{project_id:p.id})).revision,saved.revision);
 fs.appendFileSync(built.artifact.path,'tampered');
 await assert.rejects(runtime.execute('design_model_build',input),/occt_artifact_digest_mismatch/);
});
