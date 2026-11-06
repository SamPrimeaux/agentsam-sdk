import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL('../frontend/' + path, import.meta.url), 'utf8');

test('plugin side-stage tabs use contribution identity rather than provider identity alone', () => {
  const store = source('src/lib/work/store.ts');
  const stage = source('src/components/workbench/side-stage.tsx');
  assert.match(store, /kind !== "plugin" \|\| \(t\.pluginId === extra\?\.pluginId && t\.stageId === extra\?\.stageId\)/);
  assert.match(stage, /stage\.pluginId === item\.pluginId && stage\.stageId === item\.stageId/);
  assert.match(stage, /stage\.pluginId === tab\.pluginId && stage\.stageId === tab\.stageId/);
});

test('side-stage menu remains account registry driven, not a personal hard-coded list', () => {
  const actions = source('agentsam/side-stage-actions.ts');
  const stage = source('src/components/workbench/side-stage.tsx');
  assert.match(actions, /listLocalStudioConnections\(\)/);
  assert.match(actions, /payload\.side_stages \?\? \[\]/);
  assert.match(stage, /stages\.map\(\(stage\)/);
});
