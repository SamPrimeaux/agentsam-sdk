import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { terminalExec } from '../../src/capabilities/terminal-exec.js';
import { createCapabilityAdapter } from '../../src/agent/capability-adapter.js';
import { toolApprovalKey } from '../../src/lib/execution-approvals.js';

function root(t) {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-terminal-exec-'));
  t.after(() => fs.rmSync(value, { recursive: true, force: true }));
  return value;
}

test('terminal.exec runs a real argv process inside the runtime-owned project', async t => {
  const cwd = root(t);
  fs.mkdirSync(path.join(cwd, 'src'));
  const seen = [];
  const result = await terminalExec({
    cwd,
    relative_cwd: 'src',
    command: 'node',
    args: ['--version'],
  }, {
    env: { PATH: process.env.PATH, OPENAI_API_KEY: 'must-not-reach-child' },
    run: async (command, args, options) => {
      seen.push({ command, args, options });
      return { code: 0, signal: null, stdout: 'v24.0.0\n', stderr: '' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.cwd, path.join(cwd, 'src'));
  assert.equal(seen[0].options.env.OPENAI_API_KEY, undefined);
  assert.equal(seen[0].options.env.PATH, process.env.PATH);
});

test('terminal.exec rejects shell strings and working-directory escape', async t => {
  const cwd = root(t);
  await assert.rejects(terminalExec({ cwd, command: 'git status', args: [] }), /pathless_executable/);
  await assert.rejects(terminalExec({ cwd, relative_cwd: '..', command: 'git', args: ['status'] }), /outside_project/);
});

test('terminal.exec is model-callable and approvals are command-specific', () => {
  const adapter = createCapabilityAdapter();
  const descriptor = adapter.toolDescriptors().find((row) => row.name === 'terminal.exec');
  assert.ok(descriptor);
  assert.equal(descriptor.risk, 'write');
  assert.equal(toolApprovalKey('terminal.exec', { command: 'git' }), 'terminal.exec:git');
  assert.equal(toolApprovalKey('terminal.exec', { command: 'npm' }), 'terminal.exec:npm');
});
