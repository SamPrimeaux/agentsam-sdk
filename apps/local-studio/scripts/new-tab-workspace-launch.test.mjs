import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../frontend/src/components/workbench/new-tab-widgets.tsx', import.meta.url);

test('New Tab Design opens the Creative Workspace gallery without silently creating a blank document or chat', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  const start = source.indexOf("if(key==='design-entry')");
  assert.notEqual(start, -1, 'Design entry should have its own launcher behavior');
  const end = source.indexOf("if(key==='slides-entry'", start);
  assert.notEqual(end, -1, 'Slides creation should remain a separate action');
  const designLaunch = source.slice(start, end);
  assert.match(designLaunch, /openSideTab\('design'/);
  assert.match(designLaunch, /title:'Design'/);
  assert.match(designLaunch, /url:'\/canvas\?workspace=creative'/);
  assert.match(designLaunch, /setActiveSideTab\(id\)/);
  assert.match(designLaunch, /setSideOpen\(true\)/);
  assert.doesNotMatch(designLaunch, /startArtifactCreation|startChat/);
});

test('New Tab opens remote artifacts through their preview URL before the original file URL', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /safeThumbnail\(a\.preview\|\|a\.open\)/);
});
