import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProjectHookRuntime, runHooks } from '../../src/commands/hooks.js';

test('hooks CLI initializes config, merges code hooks, and records value-free receipts', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-hooks-cli-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-hooks-home-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"hooks-test","private":true}\n');

  let output = '';
  const initialized = await runHooks(['init', '--json'], { cwd: root, home, write: (text) => { output += text; } });
  assert.equal(initialized.created, true);
  assert.equal(fs.existsSync(path.join(root, '.agentsam', 'hooks.json')), true);

  const experience = await createProjectHookRuntime({
    cwd: root,
    projectRoot: root,
    home,
    ownerId: 'local',
    hooks: {
      user_prompt_submitted: {
        id: 'code.audit',
        handler: () => ({ additional_context: 'safe context' }),
      },
    },
  });
  assert.equal(experience.definitions[0].metadata.hook_source, 'code');
  const dispatched = await experience.runtime.dispatch(
    'user_prompt_submitted',
    { prompt: 'private prompt value' },
    { session_id: 'sess_test', source: 'test' },
    { cwd: root },
  );
  assert.equal(dispatched.output.additional_context, 'safe context');

  output = '';
  const executions = await runHooks(['executions', '--json'], { cwd: root, home, ownerId: 'local', write: (text) => { output += text; } });
  assert.equal(executions.length, 1);
  assert.equal(executions[0].hook_key, 'code.audit');
  assert.deepEqual(executions[0].input_keys, ['prompt']);
  assert.doesNotMatch(output, /private prompt value/);

  output = '';
  const status = await runHooks(['status', '--json'], { cwd: root, home, ownerId: 'local', write: (text) => { output += text; } });
  assert.equal(status.config.hooks, 0);
  assert.equal(status.sources.stored_total, 0);
});
