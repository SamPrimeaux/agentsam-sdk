import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const run=(...args)=>spawnSync(process.execPath,['scripts/publish-selected-package.mjs',...args],{
 encoding:'utf8',env:{...process.env,CI:'false'}
});
test('independently selected package release uses its own manifest version',()=>{
 for(const [key,dir] of [
  ['completeful','packages/providers/completeful'],
  ['merch','packages/agentsam-merch'],
  ['ecommerce','apps/ecommerce-cms-agentsam']
 ]){
  const p=JSON.parse(readFileSync(dir+'/package.json','utf8'));
  const result=run('--plan',key);
  assert.equal(result.status,0,result.stderr);
  assert.ok(result.stdout.includes(p.name+'@'+p.version),result.stdout);
 }
});
test('only allowlisted package targets are accepted',()=>{
 assert.notEqual(run('--plan','../../packages/identity').status,0);
});
test('publishing on a local machine fails closed',()=>{
 const result=run('--publish','completeful');
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/publish_requires_approved_main_workflow/);
});
