import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile,stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../bin/iamscene.mjs',import.meta.url));
function call(args) {return spawnSync(process.execPath,[cli,...args],{encoding:'utf8'});}

test('CLI lists actual capabilities, imports an OBJ and verifies converted IAMScene without changing source',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'iamscene-format-cli-'));
  try {
    const original=path.join(dir,'triangle.obj');
    const scene=path.join(dir,'triangle.iamscene.json');
    const input='o first\nv 0 0 0\nv 1000 0 0\nv 0 1000 0\nf 1 2 3\n';
    await writeFile(original,input);
    const formats=call(['formats']);
    assert.equal(formats.status,0,formats.stderr);
    assert.equal(JSON.parse(formats.stdout).find(f=>f.id==='blend').operations.import,'unavailable');
    const convert=call(['convert',original,'--out',scene,'--units','mm']);
    assert.equal(convert.status,0,convert.stderr);
    const receipt=JSON.parse(convert.stdout);
    assert.equal(receipt.generatedFiles.length,2);
    assert.equal((await readFile(original,'utf8')),input);
    assert.equal(JSON.parse(await readFile(scene,'utf8')).scene.nodes.length,2);
    for (const file of receipt.generatedFiles) assert.ok((await stat(path.resolve(dir,file.uri))).size>100);
    assert.equal(call(['convert',original,'--out',scene,'--units','mm']).status,1,'output is never silently overwritten');
    const verify=call(['verify',scene]);
    assert.equal(verify.status,0,verify.stderr);
    assert.equal(JSON.parse(verify.stdout).roundTrip.passed,true);
    const unsupported=path.join(dir,'unverified.blend');
    await writeFile(unsupported,new Uint8Array([1,2,3]));
    const report=call(['verify',unsupported]);
    assert.equal(report.status,2);
    assert.equal(JSON.parse(report.stdout).semanticImport,'unavailable');
  } finally {await rm(dir,{force:true,recursive:true});}
});
