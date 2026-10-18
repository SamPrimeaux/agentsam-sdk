import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const frontend = path.resolve(import.meta.dirname, '../frontend');
const source = (relative) => readFileSync(path.join(frontend, relative), 'utf8');

test('obsolete Ship UI cannot be opened from navigation, palette, or side-stage actions', () => {
  assert.doesNotMatch(source('src/components/shell/nav-rail.tsx'), /itemId="ship"|to: "\/ship"/);
  assert.doesNotMatch(source('src/components/workbench/command-palette.tsx'), /to: "\/ship"/);
  assert.doesNotMatch(source('agentsam/side-stage-actions.ts'), /id: 'ship'/);
  assert.doesNotMatch(source('src/components/workbench/side-stage.tsx'), /<DeployStage|from .*workbench\/deploy/);
});

test('legacy /ship routes redirect to the supported secrets page', () => {
  for (const file of ['src/routes/_app/ship.tsx', 'src/routes/(apps)/ship.tsx']) {
    const route = source(file);
    assert.match(route, /<Navigate to="\/settings\/keys" replace \/>/);
    assert.doesNotMatch(route, /DeployStage/);
  }
  assert.match(source('src/lib/work/store.ts'), /filter\(\(t\) => t\.kind !== "deploy"\)/);
});
