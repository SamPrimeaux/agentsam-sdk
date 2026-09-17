import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

function run(...args) {
  return spawnSync(process.execPath, ['src/cli.js', ...args], { cwd: repoRoot, encoding: 'utf8' });
}

test('agentsam help is a first-class alias of --help', () => {
  const help = run('help');
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stderr, /Unknown command/);
  assert.match(help.stdout, /Agent Sam SDK — CLI v/);
  assert.match(help.stdout, /agentsam help/);
  assert.match(help.stdout, /account-aware interactive experience/);
  assert.doesNotMatch(help.stdout, /Prove locally first/);

  const flag = run('--help');
  assert.equal(flag.status, 0, flag.stderr);
  assert.equal(help.stdout, flag.stdout);
});
