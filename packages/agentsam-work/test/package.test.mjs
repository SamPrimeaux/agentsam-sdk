import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
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


test('Projects surface keeps the established Work grammar and now supports full CRUD', () => {
  const source = readFileSync(new URL('../src/frontend/surfaces/ProjectsSurface.tsx', import.meta.url), 'utf8');
  for (const label of ['All', 'Active', 'Production', 'Starred', 'Archived']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Search projects/);
  assert.match(source, /\+ New project/);
  assert.match(source, /More actions for/);
  assert.match(source, /Current objective/);
  assert.doesNotMatch(source, /not available on hosted yet/);
});

test('every Work surface hides controls the host cannot perform (capability gated)', () => {
  const read = (name) => readFileSync(new URL(`../src/frontend/${name}`, import.meta.url), 'utf8');
  assert.match(read('surfaces/TicketsSurface.tsx'), /caps\.create/);
  assert.match(read('surfaces/ProjectsSurface.tsx'), /caps\.delete/);
  assert.match(read('surfaces/CalendarSurface.tsx'), /caps\.update/);
});

test('theme: no literal colors in Work UI source; hex only in the standalone defaults block', () => {
  const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
  const dir = new URL('../src/frontend/', import.meta.url);
  const files = [];
  const walk = (url) => {
    for (const entry of readdirSync(url, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url);
      if (entry.isDirectory()) walk(child);
      else if (/\.(tsx|ts)$/.test(entry.name) && entry.name !== 'theme.ts') files.push(child);
    }
  };
  walk(dir);
  for (const file of files) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), COLOR, `literal color in ${file.pathname.split('/src/')[1]}`);
  }
  const css = readFileSync(new URL('../src/frontend/theme.css', import.meta.url), 'utf8');
  const afterDefaults = css.slice(css.indexOf('.agentsam-work {'));
  assert.doesNotMatch(afterDefaults, COLOR, 'theme.css has literal colors outside the :root defaults block');
});
