import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceOnboarding, createOnboardingState, currentStep } from './index.ts';
import { buildTreeFromPaths, collapseAll, expandToPath, createFileTreeState } from '../filetree/index.ts';

test('onboarding advances one step at a time', () => {
  let state = createOnboardingState();
  assert.equal(currentStep(state)?.id, 'welcome');
  let r = advanceOnboarding(state, '');
  state = r.state;
  assert.equal(currentStep(state)?.id, 'confirm_account');
  r = advanceOnboarding(state, 'no');
  assert.equal(r.state.stepIndex, state.stepIndex);
  r = advanceOnboarding(state, 'yes');
  state = r.state;
  assert.equal(currentStep(state)?.id, 'choose_workspace');
});

test('file tree starts collapsed and expands to path', () => {
  const roots = buildTreeFromPaths(['src/app.js', 'src/lib/util.ts', 'README.md']);
  let state = createFileTreeState(roots);
  assert.equal(state.openDirs.size, 0);
  state = expandToPath(state, 'src/lib/util.ts');
  assert.ok(state.openDirs.has('src'));
  assert.ok(state.openDirs.has('src/lib'));
  state = collapseAll(state);
  assert.equal(state.openDirs.size, 0);
});
