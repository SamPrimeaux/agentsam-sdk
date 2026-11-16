import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

test('Local Studio canonical Work project chat module is included in a clean checkout', () => {
  const file = 'apps/local-studio/frontend/src/lib/project-chat-links.ts';
  assert.equal(existsSync(resolve(root, file)), true);
  assert.equal(git('ls-files', '--error-unmatch', file), file);
});

test('root work output is ignored without ignoring nested application source', () => {
  assert.match(git('check-ignore', '--no-index', 'work/theme-harvest'), /^work\/theme-harvest$/);
  const source = 'apps/local-studio/frontend/src/lib/work/another-new-module.ts';
  const ignored = spawnSync('git', ['check-ignore', '--no-index', source], { cwd: root, encoding: 'utf8' });
  assert.equal(ignored.status, 1, `nested source unexpectedly ignored: ${ignored.stdout} ${ignored.stderr}`);
});
