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
