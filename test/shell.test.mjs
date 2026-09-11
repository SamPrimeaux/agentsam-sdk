import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { dispatchShellLine, renderShellCatalog, tokenizeShellLine } from '../src/commands/shell.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

test('shell tokenizer preserves Windows paths and quoted arguments', () => {
  assert.deepEqual(tokenizeShellLine('/cd C:\\Users\\conno\\fuelnreetime'), ['/cd', 'C:\\Users\\conno\\fuelnreetime']);
  assert.deepEqual(tokenizeShellLine('/cd "C:\\Users\\Connor Smith\\repo"'), ['/cd', 'C:\\Users\\Connor Smith\\repo']);
  assert.deepEqual(tokenizeShellLine('/agent "inspect this repo"'), ['/agent', 'inspect this repo']);
});

test('shell catalog advertises commands that the REPL owns', () => {
  const catalog = renderShellCatalog();
  assert.match(catalog, /\/help\s+Show Agent Sam commands/);
  assert.match(catalog, /\/status\s+Local project/);
  assert.match(catalog, /\/exit\s+Exit Agent Sam shell/);
});

test('dispatch handles help, pwd, cd, and exit without falling through to host shell', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-shell-'));
  const child = path.join(root, 'child folder');
  fs.mkdirSync(child);
  let output = '';
  const state = { cwd: root, write: (text) => { output += text; } };

  let result = await dispatchShellLine('/help', state);
  assert.equal(result.handled, true);
  assert.equal(result.exit, false);
  assert.match(output, /Slash commands/);

  output = '';
  result = await dispatchShellLine('/pwd', state);
  assert.equal(result.handled, true);
  assert.equal(output.trim(), root);

  output = '';
  result = await dispatchShellLine('/cd "child folder"', state);
  assert.equal(result.handled, true);
  assert.equal(state.cwd, child);
  assert.equal(output.trim(), child);

  result = await dispatchShellLine('/exit', state);
  assert.equal(result.exit, true);
});

test('CLI supports a deterministic one-shot slash command for regression tests', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', 'shell', '--command', '/help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Agent Sam Terminal/);
  assert.match(result.stdout, /\/help/);
  assert.match(result.stdout, /\/exit/);
});
