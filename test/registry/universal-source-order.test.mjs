import assert from 'node:assert/strict';
import test from 'node:test';
import {buildUniversalSource} from '../../src/registry/universal-source.js';

test('universal registry command ordering is locale-independent and deterministic',()=>{
  const source=buildUniversalSource();
  const keys=source.commands.map(row=>[row.package_manager,row.executable,row.command_key].join('|'));
  const expected=[...keys].sort((left,right)=>left<right?-1:left>right?1:0);
  assert.deepEqual(keys,expected);
});
