import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preparedTurnOne,saveTurnOneLocally,comparePreparedTurns } from '../../src/registry/turn-one.js';

test('turn-one diagnostics capture the exact supplied pre-provider payload only with explicit path',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-audit-test-'));
 try{
  const file=path.join(dir,'audit.json');
  const audit=preparedTurnOne({source:'cli-agent',provider:'openai',model:'test',instructions:'system',messages:[{role:'user',content:'hi'}],tools:[{name:'capability.search'}]});
  saveTurnOneLocally(file,audit);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),audit);
  assert.equal(fs.statSync(file).mode & 0o777,0o600);
  assert.throws(()=>saveTurnOneLocally(file,audit),/file_exists/);
  assert.deepEqual(comparePreparedTurns(audit,{...audit,tools:[]}).changed,['tool_names','tool_schema_chars']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
