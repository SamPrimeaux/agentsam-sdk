import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(import.meta.url);
const tsc = require.resolve('typescript/bin/tsc');

test('published root and skills exports provide strict TypeScript declarations', () => {
  const fixture = path.join(packageRoot, 'test', 'typescript-consumer.mts');
  const result = spawnSync(process.execPath, [
    tsc, '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext',
    '--moduleResolution', 'NodeNext', fixture,
  ], { cwd: packageRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
