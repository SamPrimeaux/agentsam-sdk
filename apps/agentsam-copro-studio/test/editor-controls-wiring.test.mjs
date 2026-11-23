import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('3D scene look and clip color adjustments reach the actual renderer', async () => {
  const world = await source('../src/CoProWorldScene.tsx');
  const sky = await source('../src/samscene/skyGenerator.ts');
  const studio = await source('../../../packages/copro-ui/src/studio.tsx');
  assert.match(world, /renderer\.domElement\.style\.filter=colorAdjustmentPreviewFilter\(adjustments\)/);
  assert.match(world, /handle\.sky\.setGlowEnabled\(environment\?\.glow!==false\)/);
  assert.match(sky, /uniform float uGlowIntensity/);
  assert.match(sky, /setGlowEnabled\(enabled: boolean\)/);
  assert.match(studio, /adjustments:activeVisualClip\.metadata\?\.adjustments/);
});

test('creative template clips render as transparent overlays over the active scene', async () => {
  const movie = await source('../src/MovieModeApp.tsx');
  const studio = await source('../../../packages/copro-ui/src/studio.tsx');
  const templates = await source('../../../packages/copro-templates/src/creative.js');
  const css = await source('../../../packages/copro-ui/styles/copro.css');
  assert.match(movie, /creativeRenderer\(project,Math\.max\(0,playheadUs\),\{/);
  assert.match(movie, /transparentBackground:true/);
  assert.match(movie, /resolveAsset:\(assetId:string\)=>mediaItems\.find/);
  assert.match(movie, /creativeOverlaySrc=\{creativeOverlaySrc\}/);
  assert.match(movie, /const sourceTrack=template\.tracks\.find/);
  assert.match(movie, /const tracks=\[track\]/);
  assert.match(movie, /applyingTemplateRef\.current/);
  assert.match(movie, /while\(usedNames\.has\(trackName\)\)/);
  assert.match(studio, /activeMedia && creativeOverlaySrc/);
  assert.match(studio, /creativeOverlaySrc \?\? previewSrc/);
  assert.match(css, /copro-preview-composition-overlay[^}]*pointer-events:none/);
  assert.match(templates, /backgroundMode:'transparent'/);
});
