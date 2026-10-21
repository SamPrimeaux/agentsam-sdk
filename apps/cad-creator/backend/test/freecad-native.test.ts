import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {resolveFreeCadAdapter,executeFreeCadBuild} from '../src/cad/freecad';
import {probeFreeCad} from '../src/cad/discovery';

const here=path.dirname(fileURLToPath(import.meta.url));
test('packaged native adapter is found independently of cwd', () => {
 const location=resolveFreeCadAdapter([here]);
 assert.ok(location && fs.existsSync(location),'FreeCAD adapter must resolve from the installed location');
 assert.equal(path.basename(location),'adapter.py');
});

test('rejects filesystem traversal in output filename', async () => {
 await assert.rejects(executeFreeCadBuild({operations:[{op:'box',length:1,width:1,height:1}],filename:'../../outside.step'}),/basename required/);
});

test('real installed FreeCAD kernel executes STEP solid and reports honest metrics', async (t) => {
 const probe=await probeFreeCad();
 if(!probe.available || probe.execution_lane!=='native') return t.skip('Native FreeCAD not installed on test runner');
 const saved=process.cwd();
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-freecad-test-'));
 try {
  process.chdir(temp);
  const result=await executeFreeCadBuild({operations:[{op:'box',name:'Wall',length:2400,width:200,height:3000}],format:'step',timeoutMs:25000});
  assert.equal(result.success,true);
  assert.equal(result.engine,'freecad-native');
  assert.ok(result.sizeBytes>100 && result.artifactBase64.length>100);
  assert.equal(result.metrics.volume,2400*200*3000);
  assert.ok(result.metrics.faces_count>=6);
 } finally {process.chdir(saved);fs.rmSync(temp,{recursive:true,force:true});}
});
