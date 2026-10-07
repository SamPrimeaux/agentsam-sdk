import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createFixtureWorkHost, populatedWorkFixture } from '../dist/fixtures/index.js';
import { WORK_THEME_CSS_VARS } from '../dist/contracts/index.js';

test('fixture host implements the portable WorkHost snapshot contract', async () => {
  const host = createFixtureWorkHost();
  const snapshot = await host.snapshot();
  assert.equal(snapshot.currentProjectId, populatedWorkFixture.currentProjectId);
  assert.ok(snapshot.projects.length > 0);
});

test('work theme contract exposes stable CSS variable authority', () => {
  assert.equal(WORK_THEME_CSS_VARS.canvas, '--agentsam-work-canvas');
  assert.equal(WORK_THEME_CSS_VARS.accent, '--agentsam-work-accent');
});


test('embedded WorkShell delegates chrome to the host application', () => {
  const built = readFileSync(new URL('../dist/frontend/index.js', import.meta.url), 'utf8');
  assert.match(built, /presentation/);
  assert.match(built, /embedded/);
  assert.match(built, /data-presentation/);
});


test('Projects surface preserves the established Work product grammar', () => {
  const source = readFileSync(
    new URL('../src/frontend/surfaces/ProjectsSurface.tsx', import.meta.url),
    'utf8',
  );
  for (const label of ['My Projects', 'Recent', 'Shared', 'Archived', 'Starred']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Search projects/);
  assert.match(source, /Create project is not available on hosted yet/);
  assert.match(source, /More actions for/);
  assert.match(source, /project\.coverImageUrl/);
});

test('Project detail preserves the established Work detail surface', () => {
  const source = readFileSync(
    new URL('../src/frontend/surfaces/ProjectDetailSurface.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /Tracked today/);
  assert.match(source, /Open tasks/);
  assert.match(source, /Repository linked and ready for indexing/);
  assert.match(source, /agentsam-work-toolbar-button/);
});
