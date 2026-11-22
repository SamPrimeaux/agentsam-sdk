import test from 'node:test';
import assert from 'node:assert/strict';
import { FINISHES, MOODS } from '../src/samspeaks-controls.ts';
import { STUDIO_FINISH_PRESETS, ATMOSPHERE_MAP } from '@inneranimalmedia/agentsam-3d-viewer';
test('SamSketch inherits shared finishes and retains viewport-specific fog defaults',()=>{
  for(const [index,preset] of STUDIO_FINISH_PRESETS.entries()){
    const {color,emissive,...rest}=preset;
    assert.deepEqual(FINISHES[index],{...rest,emissive:'#'+emissive.toString(16).padStart(6,'0')});
  }
  assert.deepEqual(MOODS.map(m=>m.fogDensity),[.012,.018,.022,.026,.015]);
  for(const mood of MOODS){
    const preset=ATMOSPHERE_MAP[mood.id];
    assert.equal(mood.keyIntensity,preset.keyIntensity);
    assert.equal(mood.fillIntensity,preset.rimIntensity);
    assert.equal(mood.ambientIntensity,preset.hemiIntensity);
    assert.equal(mood.exposure,preset.exposure);
  }
});
