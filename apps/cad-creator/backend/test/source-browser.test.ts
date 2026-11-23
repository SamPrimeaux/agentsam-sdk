import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {discoverCadSources} from '../src/cad/source-discovery';
import {nativeApplicationForFormat,installCadSourceBrowserRoutes} from '../src/cad/source-browser';

test('source browser serves only indexed source IDs, preserves bytes and allows native app selection',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-source-browser-'));
 const prev=process.env.AGENTSAM_CAD_SOURCE_ROOTS;
 const dir=path.join(root,'builds','v1.5');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'sketch.scad'),'cube([4,5,6]);');
 fs.writeFileSync(path.join(dir,'model.glb'),Buffer.from('glTF\x02\x00\x00\x00mock preview'));
 const newFiles:Record<string,{id:string;role:string}>={
  'sheet.svg':{id:'image.svg',role:'exchange'},
  'part.stl':{id:'model.stl',role:'exchange'},
  'review.mov':{id:'video.quicktime',role:'presentation'},
  'house.ifc':{id:'bim.ifc',role:'native-bim'},
  'house.ifczip':{id:'bim.ifczip',role:'native-bim'},
  'solid.igs':{id:'cad.iges',role:'native-bim'},
  'solid.brep':{id:'cad.opencascade-brep',role:'native-bim'},
  'prototype.3mf':{id:'model.3mf',role:'exchange'},
  'view.iamscene.json':{id:'model.iamscene',role:'presentation'},
  'part.iamgeometry':{id:'model.iamgeometry',role:'exchange'},
 };
 for(const filename of Object.keys(newFiles))
  fs.writeFileSync(path.join(dir,filename),Buffer.from('source bytes for '+filename));
 // Larger than the hashing buffer: regression guard for constant-memory hashing.
 fs.writeFileSync(path.join(dir,'large.step'),Buffer.alloc(1024*1024+17,0x5a));
 fs.writeFileSync(path.join(dir,'unrelated.json'),'{"not":"a CAD receipt"}');
 process.env.AGENTSAM_CAD_SOURCE_ROOTS=root;
 const files=discoverCadSources([{project:path.basename(root),root}]);
 const scad=files.find(x=>x.format==='SCAD'),glb=files.find(x=>x.format==='GLB');
 assert.ok(scad&&glb);
 const app=express();app.use(express.json());installCadSourceBrowserRoutes(app);
 const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{
  const s=app.listen(0,'127.0.0.1',()=>resolve(s));
 });
 try{
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base='http://127.0.0.1:'+address.port+'/api/cad/sources/';
  const meta=await fetch(base+scad.id+'/metadata');assert.equal(meta.status,200);
  const md=await meta.json();assert.equal(md.source.sha256,scad.sha256);
  const text=await fetch(base+scad.id+'/text');assert.equal(text.status,200);
  assert.equal(await text.text(),'cube([4,5,6]);');
  const asset=await fetch(base+glb.id+'/preview');assert.equal(asset.status,200);
  assert.equal(asset.headers.get('Content-Type'),'model/gltf-binary');
  assert.equal((await asset.arrayBuffer()).byteLength,fs.statSync(path.join(dir,'model.glb')).size);
  assert.equal((await fetch(base+'../../passwd/metadata')).status,404);
  assert.equal((await fetch(base+scad.id+'/preview')).status,415);
  assert.equal(nativeApplicationForFormat('SCAD'),'OpenSCAD');
  assert.equal(nativeApplicationForFormat('BLEND'),'Blender');
  assert.equal(nativeApplicationForFormat('FCSTD'),'FreeCAD');
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  if(prev===undefined)delete process.env.AGENTSAM_CAD_SOURCE_ROOTS;else process.env.AGENTSAM_CAD_SOURCE_ROOTS=prev;
  fs.rmSync(root,{recursive:true,force:true});
 }
});
