import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workspaceRead,workspaceWrite } from '../../src/capabilities/workspace-files.js';

test('workspace IO stays scoped and requires optimistic concurrency for updates',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-scoped-'));
 try{
  fs.mkdirSync(path.join(root,'pages'));
  const a=workspaceWrite({path:'pages/index.html',content:'<h1>Hello</h1>'},root);
  const read=workspaceRead({path:'pages/index.html'},root);
  assert.equal(read.content,'<h1>Hello</h1>');
  assert.equal(read.sha256,a.sha256);
  assert.throws(()=>workspaceWrite({path:'pages/index.html',content:'other'},root),/expected_sha256/);
  assert.equal(workspaceWrite({path:'pages/index.html',content:'other',expected_sha256:a.sha256},root).written,true);
  assert.throws(()=>workspaceRead({path:'../outside'},root),/outside_root/);
  assert.throws(()=>workspaceRead({path:'.env'},root),/protected_path/);
  fs.symlinkSync(os.tmpdir(),path.join(root,'escape'));
  assert.throws(()=>workspaceWrite({path:'escape/unsafe.txt',content:'unsafe'},root),/symlink_escape/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
