import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);

function run(...args) {
  return spawnSync(process.execPath, ['src/cli.js', ...args], { cwd: repoRoot, encoding: 'utf8' });
}

test('agentsam help is concise, topic-aware, and deterministic outside a TTY', () => {
  const help = run('help');
  assert.equal(help.status, 0, help.stderr);
  assert.doesNotMatch(help.stderr, /Unknown command/);
  assert.match(help.stdout, /Agent Sam/);
  assert.match(help.stdout, /SAM = Systematic Autonomous Machinery/);
  assert.match(help.stdout, /agentsam help <topic>/);
  assert.match(help.stdout, /press \/ for the command picker/i);
  assert.doesNotMatch(help.stdout, /Inspect options:/);

  const topic = run('help', 'runtime');
  assert.equal(topic.status, 0, topic.stderr);
  assert.match(topic.stdout, /Runtime \/ terminal/);
  assert.match(topic.stdout, /agentsam connections/);
  assert.match(topic.stdout, /agentsam deploy/);

  const all = run('help', '--all');
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /Build \/ inspect/);
  assert.match(all.stdout, /Create \/ extend/);

  const allAlias = run('help', 'all');
  assert.equal(allAlias.status, 0, allAlias.stderr);
  assert.equal(allAlias.stdout, all.stdout);

  const flag = run('--help');
  assert.equal(flag.status, 0, flag.stderr);
  assert.match(flag.stdout, /agentsam help <topic>/);
  assert.doesNotMatch(flag.stdout, /Inspect options:/);
});
