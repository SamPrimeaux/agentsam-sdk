import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {probeOpenScadImport} from '../src/cad/openscad-library-probe';
import {validateOpenScadSource,executeOpenScadCompiler} from '../src/cad/openscad';
import {discoverOpenScad} from '../src/cad/discovery';

test('trusted library probe checks real file and rejects traversal / external symlinks',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-scad-libraries-'));
 const external=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-scad-external-'));
 try{
  fs.mkdirSync(path.join(root,'Sample'));
  fs.writeFileSync(path.join(root,'Sample','shapes.scad'),'module fixture(){cube([1,2,3]);}');
  fs.writeFileSync(path.join(external,'secret.scad'),'cube(100);');
  fs.symlinkSync(path.join(external,'secret.scad'),path.join(root,'Sample','linked.scad'));
  assert.equal(probeOpenScadImport('include <Sample/shapes.scad>',[root]),true);
  assert.equal(probeOpenScadImport('include <Sample/missing.scad>',[root]),false);
  assert.equal(probeOpenScadImport('use <Sample/linked.scad>',[root]),false);
  assert.equal(probeOpenScadImport('include <../secret.scad>',[root]),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});fs.rmSync(external,{recursive:true,force:true})}
});
test('native compiler accepts a trusted installed library and returns real artifact evidence',async(t)=>{
 if(!discoverOpenScad(process.env).binary){t.skip('Native OpenSCAD unavailable');return}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-scad-compile-'));
 const original=process.env.AGENTSAM_CAD_OPENSCAD_LIBRARY_ROOTS;
 try{
  fs.mkdirSync(path.join(root,'Sample'));
  fs.writeFileSync(path.join(root,'Sample','shapes.scad'),'module fixture(){cube([2,3,4]);}');
  process.env.AGENTSAM_CAD_OPENSCAD_LIBRARY_ROOTS=root;
  const source='include <Sample/shapes.scad>\nfixture();';
  validateOpenScadSource(source);
  assert.throws(()=>validateOpenScadSource('include <Unknown/shapes.scad>\ncube(1);'),/library_missing_or_untrusted/);
  const result=await executeOpenScadCompiler({source,filename:'sample.stl'});
  assert.equal(result.success,true);
  assert.equal(result.verified,true);
  assert.equal(result.engine,'openscad-native');
  assert.match(String(result.sha256),/^[a-f0-9]{64}$/);
  assert.ok(result.sizeBytes>60);
 }finally{
  if(original===undefined)delete process.env.AGENTSAM_CAD_OPENSCAD_LIBRARY_ROOTS;
  else process.env.AGENTSAM_CAD_OPENSCAD_LIBRARY_ROOTS=original;
  fs.rmSync(root,{recursive:true,force:true});
 }
});
