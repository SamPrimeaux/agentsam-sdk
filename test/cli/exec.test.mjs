import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
function cli(...args) {
 const r=spawnSync(process.execPath,[path.join(root,'bin/agentsam'),'exec',...args],{cwd:root,encoding:'utf8',timeout:15000});
 return {exit:r.status, output:r.stdout.trim(),stderr:r.stderr};
}
test('exec is advertised through the canonical CLI command catalog',()=>{
 const r=spawnSync(process.execPath,[path.join(root,'bin/agentsam'),'exec','--help'],{encoding:'utf8'});
 assert.equal(r.status,0);assert.match(r.stdout,/--prompt-file/);
});
test('exec rejects absent and conflicting prompt sources',()=>{
 for (const args of [[],['--prompt','yes','--prompt-file','file']]) {
  const r=cli(...args,'--json');assert.equal(r.exit,1);const result=JSON.parse(r.output);assert.equal(result.ok,false);assert.match(result.error.message,/exactly one/);
 }
});
test('exec rejects missing workspace without falling back to current directory',()=>{
 const r=cli('--prompt','test','--cwd','/definitely/not/existing/sam-workspace','--json');
 assert.equal(r.exit,1);assert.match(JSON.parse(r.output).error.message,/directory not found/);
});
test('exec rejects unknown flags before provider invocation',()=>{
 const r=cli('--prompt','test','--unsupported','value','--json');
 assert.equal(r.exit,1);assert.match(JSON.parse(r.output).error.message,/unknown exec argument/);
});
