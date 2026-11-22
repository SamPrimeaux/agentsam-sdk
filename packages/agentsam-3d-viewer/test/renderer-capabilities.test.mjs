import test from 'node:test';
import assert from 'node:assert/strict';
import {isSoftwareWebGLRenderer} from '../src/renderer-capabilities.js';

test('software WebGL renderers are identified from the unmasked renderer string',()=>{
  const renderer={getContext:()=>({getExtension:()=>({UNMASKED_RENDERER_WEBGL:0x9246}),getParameter:()=> 'Google SwiftShader'})};
  assert.equal(isSoftwareWebGLRenderer(renderer),true);
});

test('hardware WebGL renderers are not treated as software',()=>{
  const renderer={getContext:()=>({getExtension:()=>({UNMASKED_RENDERER_WEBGL:0x9246}),getParameter:()=> 'Apple M3 Pro'})};
  assert.equal(isSoftwareWebGLRenderer(renderer),false);
});

test('renderer capability inspection safely handles missing and restricted contexts',()=>{
  assert.equal(isSoftwareWebGLRenderer(null),false);
  assert.equal(isSoftwareWebGLRenderer({getContext:()=>{throw new Error('context unavailable')}}),false);
});
