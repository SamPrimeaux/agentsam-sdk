import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { defaultProjectRules, findProjectRules, loadProjectRules } from '../src/lib/project-rules.js';

test('.agentsamrules behaves like a committed repo-level instruction file', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-rules-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nested = path.join(root, 'src', 'nested');
  fs.mkdirSync(nested, { recursive: true });
  const content = defaultProjectRules('demo');
  fs.writeFileSync(path.join(root, '.agentsamrules'), content);

  assert.equal(findProjectRules(nested), path.join(root, '.agentsamrules'));
  const loaded = loadProjectRules(nested);
  assert.equal(loaded.found, true);
  assert.equal(loaded.content, content);
  assert.match(loaded.hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(loaded.truncated, false);
});

test('project rules are deterministically bounded before entering context', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-rules-bound-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, '.agentsamrules'), 'x'.repeat(200));
  const loaded = loadProjectRules(root, { maxChars: 40 });
  assert.equal(loaded.chars, 40);
  assert.equal(loaded.source_chars, 200);
  assert.equal(loaded.truncated, true);
});


test('project rules discovery never leaks across the repository boundary', t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-rules-boundary-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  fs.writeFileSync(path.join(parent, '.agentsamrules'), 'parent rules\n');
  const repo = path.join(parent, 'repo');
  const nested = path.join(repo, 'src');
  fs.mkdirSync(path.join(repo, '.git'), { recursive: true });
  fs.mkdirSync(nested, { recursive: true });
  assert.equal(findProjectRules(nested), null);
});
