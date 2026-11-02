import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const command = path.join(repo, 'scripts/wip-landscape.mjs');

test('WIP inventory is read-only and reports real local branches, worktrees and stashes', () => {
  const statusBefore = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
  const result = JSON.parse(execFileSync(process.execPath, [command, '--json'], { cwd: repo, encoding: 'utf8' }));
  const statusAfter = execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' });
  assert.equal(statusAfter, statusBefore);
  assert.equal(result.mainRef, 'origin/main');
  assert.ok(result.counts.branches >= 1);
  assert.ok(result.worktrees.some(worktree => worktree.branch && worktree.path));
  assert.ok(Array.isArray(result.stashes));
  assert.ok(result.branches.every(b => Number.isInteger(b.ahead) && b.ahead >= 0));
});
