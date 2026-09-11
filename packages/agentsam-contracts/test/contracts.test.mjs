import assert from 'node:assert/strict';
import test from 'node:test';

// Runtime-free package: this test guards the source package contract from accidentally
// taking a React/runtime dependency during future refactors.
test('contracts package stays framework neutral', async () => {
  const pkg = JSON.parse(await (await import('node:fs/promises')).readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
});
