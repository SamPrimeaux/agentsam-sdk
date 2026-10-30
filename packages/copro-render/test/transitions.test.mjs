import test from 'node:test';import assert from 'node:assert/strict';
import {TRANSITIONS,normalizeTransition,transitionProgress,transitionFragmentSource,createCoProTransitionRenderer} from '../src/transitions/index.js';
test('36 shaders normalize to existing transitionOut shape without external engines',()=>{
 assert.equal(TRANSITIONS.length,36);assert.equal(new Set(TRANSITIONS.map(x=>x.id)).size,36);
 for(const t of TRANSITIONS){const preset=normalizeTransition({type:t.id,durationUs:500000});assert.equal(preset.type,t.id);assert.equal(preset.durationUs,500000);assert.match(transitionFragmentSource(t),/void main/);assert.match(transitionFragmentSource(t),/vec4 transition/);assert.ok(t.provenance.license);}
 assert.equal(normalizeTransition('fade').type,'gl:Fade');assert.deepEqual(normalizeTransition('none'),{type:'none',durationUs:0,parameters:{}});
});
test('typed uniforms reject malformed vector, boolean, integer and unknown fields',()=>{
 assert.throws(()=>normalizeTransition({type:'gl:Directional',parameters:{direction:[1]}}),/invalid/);
 assert.throws(()=>normalizeTransition({type:'gl:CircleOpen',parameters:{opening:1}}),/invalid/);
 assert.throws(()=>normalizeTransition({type:'gl:Pixelize',parameters:{steps:1.5}}),/invalid/);
 assert.throws(()=>normalizeTransition({type:'gl:Fade',parameters:{bad:1}}),/unknown/);
 assert.throws(()=>normalizeTransition({type:'gl:Fade',durationUs:0}),/invalid/);
 assert.throws(()=>normalizeTransition('invalid'),/unknown/);
 const a=normalizeTransition('gl:Directional');a.parameters.direction[0]=77;assert.notEqual(normalizeTransition('gl:Directional').parameters.direction[0],77);
});
test('microsecond progress clamps and unsupported WebGL fails explicitly',()=>{
 assert.equal(transitionProgress(-1,1000),0);assert.equal(transitionProgress(500,1000),.5);assert.equal(transitionProgress(1001,1000),1);
 assert.throws(()=>transitionProgress(.5,1000),/invalid/);assert.throws(()=>createCoProTransitionRenderer({getContext:()=>null}),/unavailable/);
});
