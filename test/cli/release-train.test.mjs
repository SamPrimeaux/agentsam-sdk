import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('release train check enforces one first-party workspace version and exact internal pins', () => {
  const output = execFileSync(process.execPath, ['scripts/release-train.mjs', 'check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /PASS all first-party workspace versions and dependency pins aligned/);
});
