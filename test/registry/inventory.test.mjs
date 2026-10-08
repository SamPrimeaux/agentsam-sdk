import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
import { createRegistry } from '../../src/registry/index.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cli = path.join(root,'src/cli.js');
const run=(args)=>spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:'utf8',timeout:15000,env:{...process.env,NO_COLOR:'1'}});
test('generated registry and package indexes are in sync with source', () => {
  execFileSync(process.execPath,['scripts/registry/generate.mjs','--check'],{cwd:root});
  execFileSync('python3',['scripts/catalog/build_catalog.py','--repo','.','--check'],{cwd:root});
});
test('declared agent-callable capability must have a bound execution handler',()=>{
 const adapter=createCapabilityAdapter({projectRoot:root});
 const registry=createRegistry({capabilityAdapter:adapter});
 assert.equal(registry.capabilities().filter(row=>row.agent_callable&&!adapter.canInvoke(row.id)).length,0);
});
test('CLI usage errors do not impersonate HTTP failures',()=>{
 const bad=run(['machine','--limit','0']);
 assert.equal(bad.status,2);
 assert.match(bad.stderr,/reason: input_invalid/);
 assert.doesNotMatch(bad.stderr,/HTTP 500|HTTP 400/);
 assert.match(bad.stderr,/example:/);
 const json=run(['machine','--limit','0','--json']);
 assert.equal(json.status,2);
 assert.match(json.stderr,/"reason": "input_invalid"/);
});
test('all catalog commands document help without running the handler',()=>{
 for (const cmd of ['deploy','start-local','machine','runtime','security','recon','rust']) {
  const r=run([cmd,'--help']);
  assert.equal(r.status,0,cmd+' should print help');
  assert.match(r.stdout,new RegExp(cmd));
 }
});
test('bare rust is help, not a failed subprocess',()=>{
 const r=run(['rust']);
 assert.equal(r.status,0);
 assert.match(r.stdout,/agentsam rust/);
});
test('machine command no longer constructs raw Error exceptions',()=>{
 const machine=readFileSync(path.join(root,'src/commands/machine.js'),'utf8');
 assert.doesNotMatch(machine,/\bnew Error\s*\(/);
});
