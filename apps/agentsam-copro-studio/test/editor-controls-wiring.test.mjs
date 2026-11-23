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

test('SamScene sky controls drive the real 3D ground, ambient/key lighting, fog and exposure', async () => {
  const world = await source('../src/CoProWorldScene.tsx');
  const panel = await source('../../../packages/copro-ui/src/stage-look-panel.tsx');
  const editor = await source('../../../packages/copro-editor/src/index.js');
  assert.match(world, /new THREE\.MeshBasicMaterial\(\{color:initialSky\.horizonHex,toneMapped:false\}\)/);
  assert.match(world, /new THREE\.ShadowMaterial\(\{color:initialSky\.nadirHex,opacity:\.22\}\)/);
  assert.match(world, /handle\.ground\.visible=!skyVideoSrc/);
  assert.match(world, /handle\.hemi\.color\.setHSL/);
  assert.match(world, /handle\.key\.color\.set\(skyConfig\.sunHex\)/);
  assert.match(world, /handle\.bounce\.color\.set\(skyConfig\.cloudAccentHex\)/);
  assert.match(world, /handle\.renderer\.toneMappingExposure=environment\?\.exposure\?\?STAGE_ENVIRONMENT_DEFAULTS\.exposure/);
  assert.match(world, /environment\?\.fogColor\?\?skyConfig\.horizonHex/);
  assert.doesNotMatch(world, /color:0x202935|#e2ecff|#fff1d3|#9fc9ff/);
  assert.match(panel, /label="Exposure"/);
  assert.match(panel, /const fogColor=environment\?\.fogColor\?\?sky\?\.bottom\?\?defaults\.fogColor/);
  assert.match(editor, /"exposure"/);
});
