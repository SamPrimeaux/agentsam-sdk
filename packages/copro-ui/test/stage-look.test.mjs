import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CoProStageLookPanel } from '../dist/stage-look-panel.js';
import { stageLookBackground, STAGE_SKIES, STAGE_FINISHES, STAGE_MOODS } from '../src/stage-environment.ts';
import { createCoProProject } from '../../copro-project/src/index.js';
import { CoProEditorSession } from '../../copro-editor/src/index.js';

test('SkyLit-inspired stage presets and finishes have stable unique IDs',()=>{
  assert.equal(STAGE_SKIES.length,8);
  assert.equal(STAGE_FINISHES.length,7);
  assert.equal(new Set(STAGE_SKIES.map(item=>item.id)).size,8);
  assert.equal(new Set(STAGE_FINISHES.map(item=>item.id)).size,7);
  for (const mood of STAGE_MOODS) {
    assert.ok(STAGE_SKIES.some(sky=>sky.id===mood.skyPreset));
    assert.ok(STAGE_FINISHES.some(finish=>finish.id===mood.finish));
  }
});
test('sky, ambient lighting hue, backdrop finish, clouds and stars visibly affect the composed stage',()=>{
  assert.equal(stageLookBackground(undefined),undefined);
  const base={skyPreset:'studio',finish:'gold',glow:true,lightHue:37};
  const first=stageLookBackground(base);
  assert.ok(first.includes('linear-gradient'));
  assert.notEqual(first,stageLookBackground({...base,skyPreset:'aurora'}));
  assert.notEqual(first,stageLookBackground({...base,finish:'carbon'}));
  assert.notEqual(first,stageLookBackground({...base,lightHue:205}));
  assert.notEqual(first,stageLookBackground({...base,stars:true}));
  assert.notEqual(first,stageLookBackground({...base,cloudDensity:0.9}));
});
test('CoPro stores stage look edits in the project with independent undo/redo',()=>{
  const session=new CoProEditorSession(createCoProProject({id:'stage-test'}));
  session.execute({type:'project.set_environment',payload:{patch:{skyPreset:'aurora',finish:'gold',stars:true}}});
  session.execute({type:'project.set_environment',payload:{patch:{cloudDensity:.5,lightHue:220,shadowSoftness:5,keyAngle:90,exposure:1.4}}});
  assert.equal(session.project.metadata.environment.skyPreset,'aurora');
  assert.equal(session.project.metadata.environment.keyAngle,90);
  assert.equal(session.project.metadata.environment.exposure,1.4);
  session.undo();
  assert.equal(session.project.metadata.environment.keyAngle,undefined);
  assert.equal(session.project.metadata.environment.exposure,undefined);
  assert.equal(session.project.metadata.environment.skyPreset,'aurora');
  session.redo();
  assert.equal(session.project.metadata.environment.keyAngle,90);
  assert.equal(session.project.metadata.environment.exposure,1.4);
});
test('rejects unsupported material IDs, sky IDs and out-of-range atmospheric values',()=>{
  const session=new CoProEditorSession(createCoProProject({id:'stage-invalid-test'}));
  for(const patch of [{skyPreset:'fake'},{finish:'fake'},{stars:1},{cloudDensity:2},{lightHue:420},{keyAngle:400},{shadowSoftness:-1},{exposure:.2},{exposure:2.6}]) {
    assert.throws(()=>session.execute({type:'project.set_environment',payload:{patch}}),/copro_environment_.*invalid/);
  }
});


test('scene environment inspector exposes one source for each sky control',()=>{
 const html=renderToStaticMarkup(React.createElement(CoProStageLookPanel,{environment:{skyPreset:'aurora'},skies:STAGE_SKIES,onChange:()=>{}}));
 assert.equal((html.match(/<strong>Cloud density<\/strong>/g)||[]).length,1);
 assert.equal((html.match(/Starfield visible/g)||[]).length,1);
 assert.match(html,/Light glow/);
 assert.match(html,/Sky time \/ phase/);
 assert.doesNotMatch(html,/Project saved/);
 assert.doesNotMatch(html,/<h2>Scene environment<\/h2>/);
});
