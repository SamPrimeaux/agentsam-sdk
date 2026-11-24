import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../styles/copro.css', import.meta.url), 'utf8');
const timeline = readFileSync(new URL('../src/timeline.tsx', import.meta.url), 'utf8');
const mediaBrowser = readFileSync(new URL('../src/media-browser.tsx', import.meta.url), 'utf8');

test('timeline clips have positioned geometry so time offsets and drag previews render', () => {
  const rule = styles.match(/\.copro-clip\s*\{([^}]*)\}/);
  assert.ok(rule, 'timeline clip rule exists');
  assert.match(rule[1], /position:\s*absolute/);
  assert.match(rule[1], /top:\s*var\(--copro-clip-top/);
  assert.match(rule[1], /left:\s*var\(--copro-clip-left/);
  assert.match(rule[1], /touch-action:\s*none/);
});

test('timeline accepts typed media drops and track-aware clip moves', () => {
  assert.match(timeline, /onDropMedia\?/);
  assert.match(timeline, /onMoveClip\?\.\(clip\.id,value\.startUs,value\.trackId\)/);
  assert.match(timeline, /data-copro-track-id/);
});

test('project media cards can be dragged instead of requiring the Add button', () => {
  assert.match(mediaBrowser, /draggable/);
  assert.match(mediaBrowser, /writeCoProMediaDragData/);
});
