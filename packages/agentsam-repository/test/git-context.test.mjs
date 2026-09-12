import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { normalizeGitRemote, resolveGitContext } from '../src/git-context.js';

test('repository package derives resource identity from Git, not account environment', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-repository-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'remote', 'add', 'origin', 'git@github.com:ExampleOrg/DemoRepo.git']);
  const context = resolveGitContext({ cwd: root });
  assert.equal(context.repoFullName, 'ExampleOrg/DemoRepo');
  assert.equal(context.owner, 'ExampleOrg');
  assert.equal(context.repo, 'DemoRepo');
  assert.equal(context.revisionSha, null);
});

test('remote normalization supports HTTPS and SSH without ownership fields', () => {
  assert.equal(normalizeGitRemote('https://github.com/Owner/Repo.git').repoFullName, 'Owner/Repo');
  assert.equal(normalizeGitRemote('git@github.com:Owner/Repo.git').repoFullName, 'Owner/Repo');
});
