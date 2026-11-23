import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const launch = read('../frontend/agentsam/AgentSamLaunchDock.tsx');
const page = read('../frontend/agentsam/AgentSamPage.tsx');
const layout = read('../frontend/src/components/workbench/work-layout.css');
const navCss = read('../../../packages/agentsam-nav/src/shell.css');

test('GoalGuru, Home and AgentSam share one packaged bottom dock', () => {
  for (const route of ['/admin/home', '/admin/ideas', '/admin/goalguru', '/admin/agentsam']) {
    assert.ok(launch.includes(route), `${route} is an opted-in destination`);
  }
  assert.match(launch, /<Nav\.LaunchDock coverage="tablet"/);
  assert.match(launch, /if \(conversationRoute\)/);
  for (const surface of ['chat', 'files', 'code', 'terminal', 'preview']) {
    assert.match(launch, new RegExp(`setWorkSurface\\('${surface}'\\)`));
  }
  assert.doesNotMatch(page, /WorkSurfaceBar/);
  assert.doesNotMatch(layout, /work-surface-bar/);
});

test('compact tablet work uses one active stage and reserves bottom dock clearance', () => {
  assert.match(page, /matchMedia\('\(max-width: 1099px\)'\)/);
  assert.match(page, /compactWorkLayout && workSurface !== 'chat'/);
  assert.match(layout, /max-width: 1099px/);
  assert.match(navCss, /min-width: 768px/);
  assert.match(navCss, /as-nav-launch-dock\[data-nav-dock-coverage="tablet"\]/);
  assert.match(read('../frontend/agentsam/shell.css'), /padding-bottom: calc\(77px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
