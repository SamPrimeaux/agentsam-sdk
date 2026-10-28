import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {installBimStarterRoutes} from '../src/cad/bim-starters';

test('existing BIM starter API exposes source-backed catalog without promoting review mesh to editable BIM',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-bim-lib-'));
 const oldRoots=process.env.AGENTSAM_CAD_SOURCE_ROOTS;
 const oldLibrary=process.env.AGENTSAM_CAD_BIM_LIBRARY;
 process.env.AGENTSAM_CAD_SOURCE_ROOTS=path.join(temp,'project');
 process.env.AGENTSAM_CAD_BIM_LIBRARY=path.join(temp,'starters');
 fs.mkdirSync(path.join(temp,'project','builds','v1.5'),{recursive:true});
 fs.mkdirSync(path.join(temp,'starters'),{recursive:true});
 fs.writeFileSync(path.join(temp,'project','builds','v1.5','DreamHouse-V1.5-review.glb'),'reference-only');
 const app=express();
 installBimStarterRoutes(app);
 const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{
  const s=app.listen(0,'127.0.0.1',()=>resolve(s));
 });
 try{
  const address=server.address();
  assert.ok(address&&typeof address==='object');
  const response=await fetch('http://127.0.0.1:'+address.port+'/api/cad/bim-starters');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.schema,'agentsam.cad.source-library.v2');
  assert.equal(body.localOnly,true);
  assert.deepEqual(body.starters,[]);
  assert.equal(body.discovered.length,1);
  assert.equal(body.discovered[0].format,'GLB');
  assert.equal(body.discovered[0].status,'review-only');
  assert.equal(body.discovered[0].revision,'V1.5');
  assert.ok(!('root' in body.discovered[0]));
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  if(oldRoots===undefined)delete process.env.AGENTSAM_CAD_SOURCE_ROOTS;else process.env.AGENTSAM_CAD_SOURCE_ROOTS=oldRoots;
  if(oldLibrary===undefined)delete process.env.AGENTSAM_CAD_BIM_LIBRARY;else process.env.AGENTSAM_CAD_BIM_LIBRARY=oldLibrary;
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
