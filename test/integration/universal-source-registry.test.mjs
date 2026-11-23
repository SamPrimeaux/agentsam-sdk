import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildUniversalSource, commandSeedSql } from '../../src/registry/universal-source.js';

const root=path.resolve(import.meta.dirname,'../..');
const python={
  schema:'agentsam.python-cli-source.v1',package:'agentsam-sdk',
  executable:'agentsam',version:'0.3.0',source:'python/agentsam_sdk/cli.py',
  commands:[{words:['doctor'],description:'diagnostics'},{words:['repository','inspect'],description:'inspect'}],
};

test('one source projection distinguishes npm/pip even when executable and subcommand collide',()=>{
  const snapshot=buildUniversalSource({root,pythonInventory:python});
  const npm=snapshot.commands.find(c=>c.package_manager==='npm'&&c.command_key==='doctor'&&c.executable==='agentsam');
  const pip=snapshot.commands.find(c=>c.package_manager==='pip'&&c.command_key==='doctor'&&c.executable==='agentsam');
  assert.ok(npm&&pip);
  assert.notEqual(npm.id,pip.id);
  assert.equal(npm.package_name,'@inneranimalmedia/agentsam-sdk');
  assert.equal(pip.package_name,'agentsam-sdk');
  assert.ok(snapshot.commands.every(c=>c.release_state==='source_only'&&!c.is_active));
  assert.equal(snapshot.skills.length,39);
  assert.equal(snapshot.workflows.length,0,'a workflow must originate from a verified scoped graph');
  assert.ok(snapshot.tools.length>0);
  assert.ok(snapshot.hooks.every(h=>h.state==='workspace_local_only'&&!h.is_active));
  assert.ok(snapshot.scripts.every(s=>s.approval_required&&!s.safe_to_run));
});

test('portable command SQL stages source only and preserves verified receipts only for identical fingerprints',()=>{
  const rows=buildUniversalSource({root,pythonInventory:python}).commands;
  const sql=commandSeedSql(rows);
  assert.match(sql,/INSERT INTO agentsam_commands_next/);
  assert.match(sql,/ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(sql,/source_sha256=excluded.source_sha256/);
  assert.doesNotMatch(sql,/INSERT INTO agentsam_commands \(/);
  assert.doesNotMatch(sql,/is_active=1|release_state='verified'[^ ]*VALUES/);
  assert.throws(()=>commandSeedSql([rows[0],rows[0]]),/duplicate_cli_id/);
});

test('Python parser inventory is derived from argparse source and has all expected existing leaves',async()=>{
  const { spawnSync }=await import('node:child_process');
  const result=spawnSync('python3',[path.join(root,'python/agentsam_sdk/registry_cli.py')],
    {encoding:'utf8',timeout:15000});
  if(result.error?.code==='ENOENT') return; // npm-only CI can test the static injected fixture.
  assert.equal(result.status,0,result.stderr);
  const parsed=JSON.parse(result.stdout);
  assert.deepEqual(parsed.commands.map(c=>c.words.join(' ')),[
    'cad doctor','data agentsam-walk','data d1-bloat','doctor',
    'repository inspect','repository inventory','repository scan-bloat',
  ]);
});
