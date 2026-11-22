import test from 'node:test';
import assert from 'node:assert/strict';
import * as dist from '../dist/shell/appearance.mjs';
import * as source from '../src/shell/appearance.mjs';

test('portable workbench appearance is built from its canonical source', () => {
  assert.deepEqual(Object.keys(dist).sort(), Object.keys(source).sort());
  for (const theme of ['light','dark']) {
    assert.deepEqual(dist.projectStudioShellAppearance(null,{theme}),source.projectStudioShellAppearance(null,{theme}));
  }
  assert.equal(dist.FIRST_PAINT_BOOTSTRAP_SCRIPT, source.FIRST_PAINT_BOOTSTRAP_SCRIPT);
});
