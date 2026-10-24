import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('npm release tarball contains only generic Campaign library and schema files', () => {
  const stdout = execFileSync(process.execPath, ['scripts/check-public-pack.mjs'], {
    cwd: new URL('..', import.meta.url), encoding: 'utf8',
  });
  assert.match(stdout, /Campaign public pack verified/);
});
