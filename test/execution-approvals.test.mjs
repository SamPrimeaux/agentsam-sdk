import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { grantExecutionApproval, isExecutionApproved, toolApprovalKey } from '../src/lib/execution-approvals.js';

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-approval-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return home;
}

test('execution approvals are exact-command and project scoped', t => {
  const home = tempHome(t);
  const one = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-project-a-'));
  const two = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-project-b-'));
  t.after(() => fs.rmSync(one, { recursive: true, force: true }));
  t.after(() => fs.rmSync(two, { recursive: true, force: true }));
  const key = toolApprovalKey('cloudflare.wrangler.native', { command: 'whoami' });
  assert.equal(key, 'cloudflare.wrangler.native:whoami');
  assert.equal(isExecutionApproved({ cwd: one, key }, { home }), false);
  grantExecutionApproval({ cwd: one, key }, { home });
  assert.equal(isExecutionApproved({ cwd: one, key }, { home }), true);
  assert.equal(isExecutionApproved({ cwd: two, key }, { home }), false);
  assert.equal(isExecutionApproved({ cwd: one, key: 'cloudflare.wrangler.native:versions.list' }, { home }), false);
});

test('write grants bind to exact file content and revision and cannot authorize a different edit',()=>{
 const fileOne={path:'src/file.js',content:'const one=1',expected_sha256:'before1'};
 const reordered={expected_sha256:'before1',content:'const one=1',path:'src/file.js'};
 const different={...fileOne,content:'const one=2'};
 const differentPath={...fileOne,path:'src/other.js'};
 const differentRevision={...fileOne,expected_sha256:'before2'};
 const key=toolApprovalKey('workspace.write',fileOne);
 assert.equal(key,toolApprovalKey('workspace.write',reordered));
 assert.notEqual(key,toolApprovalKey('workspace.write',different));
 assert.notEqual(key,toolApprovalKey('workspace.write',differentPath));
 assert.notEqual(key,toolApprovalKey('workspace.write',differentRevision));
 assert.match(key,/^workspace\.write:[0-9a-f]{24}$/);
});
test('terminal argument changes and resource mutating inputs require separate approvals',()=>{
 assert.notEqual(toolApprovalKey('terminal.exec',{command:'git',args:['status']}),
   toolApprovalKey('terminal.exec',{command:'git',args:['push']}));
 assert.notEqual(toolApprovalKey('project.delete',{id:'a',confirm_id:'a'}),
   toolApprovalKey('project.delete',{id:'b',confirm_id:'b'}));
 assert.notEqual(toolApprovalKey('agentsam_d1_create',{name:'test-a',confirm_name:'test-a'}),
   toolApprovalKey('agentsam_d1_create',{name:'test-b',confirm_name:'test-b'}));
});
